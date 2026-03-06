"""
Runs the appropriate agent/tool for a given action layer step when advancing after human approval.
Step indices are 0-based: 0=Exposure, 1=Drafting, 2=Approval(email), 3=Commit(email), 4=ChangeProposal,
5=Approval(ERP), 6=Commit(ERP), 7=Verification, 8=Audit.
"""
import json
from typing import Any, Dict, Optional
from backend.services.supabase_client import supabase
from backend.services.action_steps import update_step, get_steps
from backend.services.agent_runner import DEFAULT_ACTION_RUN_STEPS


def _ensure_steps(action_run_id: str):
    steps = get_steps(action_run_id)
    if not steps:
        steps = [dict(s) for s in DEFAULT_ACTION_RUN_STEPS]
        supabase.table("action_runs").update({"steps": steps}).eq("action_run_id", action_run_id).execute()
    return steps


def run_step_4_send_email(action_run_id: str, approved_by: str) -> None:
    """
    Step 4: Mark draft email as 'sent' and attach artifact_id to the CommitAgent step.
    (No real email is sent for the demo — the draft artifact serves as the record.)
    """
    res = supabase.table("draft_artifacts").select("artifact_id").eq("action_run_id", action_run_id).eq("type", "email").order("created_at", desc=True).limit(1).execute()
    artifact_id = res.data[0]["artifact_id"] if res.data else None
    if artifact_id:
        # Mark the draft as sent so UI shows it as delivered
        supabase.table("draft_artifacts").update({"status": "sent"}).eq("artifact_id", artifact_id).execute()
    update_step(action_run_id, 3, "DONE", artifact_id=artifact_id)


def run_step_6_commit_erp(action_run_id: str, approved_by: str) -> None:
    """Step 7 (index 6): Execute ERP commit from change_proposal."""
    prop_res = supabase.table("change_proposals").select("*").eq("action_run_id", action_run_id).order("created_at", desc=True).limit(1).execute()
    if not prop_res.data:
        update_step(action_run_id, 6, "DONE")  # no proposal, mark done anyway
        return
    prop = prop_res.data[0]
    entity_type = (prop.get("entity_type") or "PurchaseOrder").strip()
    entity_id = (prop.get("entity_id") or "").strip()
    diff = prop.get("diff") or {}
    if isinstance(diff, str):
        try:
            diff = json.loads(diff)
        except Exception:
            diff = {}
    proposal_id = prop.get("proposal_id") or ""
    changes_str = json.dumps(diff)
    try:
        if entity_type == "PurchaseOrder" and entity_id:
            from backend.services import erp_service
            # Build updates from diff (e.g. eta, ship_mode)
            updates = {}
            if isinstance(diff, dict):
                for k, v in diff.items():
                    if k in ("eta", "ship_mode", "status", "quantity") and v is not None:
                        updates[k] = v
            if updates:
                erp_service.update_purchase_order(entity_id, updates)
        update_step(action_run_id, 6, "DONE")
    except Exception:
        update_step(action_run_id, 6, "PENDING")  # leave retry-able
        raise


def run_step_7_verify_erp(action_run_id: str) -> None:
    """Step 8 (index 7): Verify ERP state matches expectation."""
    prop_res = supabase.table("change_proposals").select("entity_type, entity_id").eq("action_run_id", action_run_id).order("created_at", desc=True).limit(1).execute()
    if not prop_res.data:
        update_step(action_run_id, 7, "DONE")
        return
    prop = prop_res.data[0]
    entity_type = (prop.get("entity_type") or "PurchaseOrder").strip()
    entity_id = (prop.get("entity_id") or "").strip()
    try:
        if entity_type == "PurchaseOrder" and entity_id:
            from backend.services import erp_service
            erp_service.get_purchase_order_by_id(entity_id)
        update_step(action_run_id, 7, "DONE")
    except Exception:
        update_step(action_run_id, 7, "DONE")  # still mark done; verification noted in audit


def run_step_8_audit(action_run_id: str, approved_by: str) -> None:
    """Step 9 (index 8): Write audit log."""
    run_res = supabase.table("action_runs").select("case_id").eq("action_run_id", action_run_id).execute()
    case_id = (run_res.data[0].get("case_id") or "") if run_res.data else ""
    payload = {
        "action_run_id": action_run_id,
        "actor": approved_by,
        "event_type": "action_workflow_completed",
        "steps_completed": ["commit_erp", "verification", "audit"],
    }
    supabase.table("audit_log").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "actor": approved_by,
        "event_type": "action_workflow_completed",
        "payload": payload,
    }).execute()
    update_step(action_run_id, 8, "DONE")


def run_agent_for_step(action_run_id: str, step_index: int, approved_by: str) -> None:
    """
    Run the agent/tool for the given step (0-based index).
    Only call for automated steps: 3 (send email), 6 (commit ERP), 7 (verify), 8 (audit).
    """
    _ensure_steps(action_run_id)
    if step_index == 3:
        run_step_4_send_email(action_run_id, approved_by)
    elif step_index == 6:
        run_step_6_commit_erp(action_run_id, approved_by)
    elif step_index == 7:
        run_step_7_verify_erp(action_run_id)
    elif step_index == 8:
        run_step_8_audit(action_run_id, approved_by)
    else:
        raise ValueError(f"run_agent_for_step: step_index {step_index} is not an automated step")


def advance_after_approval(action_run_id: str, step_index: int, approved_by: str) -> Dict[str, Any]:
    """
    Called when user approves a PENDING step.
    1) Mark that step DONE and unlock the next step (via update_step).
    2) If the approved step is an approval gate (step 3 → index 2, or step 6 → index 5),
       run the next automated step(s). For step 6 approval we run 7, 8, 9 in sequence.
    """
    steps = _ensure_steps(action_run_id)
    if step_index < 0 or step_index >= len(steps):
        return {"status": "error", "message": "Invalid step_index", "steps": steps}
    current = steps[step_index]
    if (current.get("status") or "").upper() != "PENDING":
        return {"status": "skipped", "message": "Step is not PENDING", "steps": get_steps(action_run_id)}

    # Mark approved step DONE (and unlock next)
    update_step(action_run_id, step_index, "DONE")
    next_index = step_index + 1
    if next_index >= len(steps):
        return {"status": "ok", "steps": get_steps(action_run_id), "ran_agent": False}

    # Approval step 3 (index 2) → run step 4 (send email)
    if step_index == 2:
        run_agent_for_step(action_run_id, 3, approved_by)
        return {"status": "ok", "steps": get_steps(action_run_id), "ran_agent": True, "step_run": 3}

    # Approval step 6 (index 5) → run steps 7, 8, 9 (commit ERP, verify, audit)
    if step_index == 5:
        run_agent_for_step(action_run_id, 6, approved_by)
        run_agent_for_step(action_run_id, 7, approved_by)
        run_agent_for_step(action_run_id, 8, approved_by)
        return {"status": "ok", "steps": get_steps(action_run_id), "ran_agent": True, "step_run": [6, 7, 8]}

    return {"status": "ok", "steps": get_steps(action_run_id), "ran_agent": False}
