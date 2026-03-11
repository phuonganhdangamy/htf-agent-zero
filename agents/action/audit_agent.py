"""
Audit Agent — converted from LLM agent to deterministic tool.

Writes immutable audit log entries. This is a pure data-write operation
(no LLM reasoning needed): given action details, write a structured
audit record to the database.
"""
import json
from typing import Dict, Any, Optional
from backend.services.supabase_client import supabase


def write_audit_record(
    case_id: str,
    action_run_id: str,
    actor: str,
    event_type: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Deterministic function: writes an immutable audit log entry. No LLM needed.

    Args:
        case_id: The risk case ID this audit belongs to
        action_run_id: The action run ID
        actor: Who performed the action
        event_type: Type of event (e.g., 'commit_executed', 'proposal_approved')
        payload: Structured details of the action

    Returns:
        Dict with status and audit_id
    """
    data = {
        "case_id": case_id,
        "action_run_id": action_run_id,
        "actor": actor,
        "event_type": event_type,
        "payload": payload,
    }

    try:
        res = supabase.table("audit_log").insert(data).execute()
        audit_id = res.data[0].get("id") if res.data else None
        return {"status": "success", "audit_id": audit_id}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def write_workflow_completion_audit(
    action_run_id: str,
    approved_by: str,
    steps_completed: Optional[list] = None,
) -> Dict[str, Any]:
    """Convenience function for writing workflow completion audit entries."""
    run_res = supabase.table("action_runs").select("case_id").eq("action_run_id", action_run_id).execute()
    case_id = (run_res.data[0].get("case_id") or "") if run_res.data else ""

    return write_audit_record(
        case_id=case_id,
        action_run_id=action_run_id,
        actor=approved_by,
        event_type="action_workflow_completed",
        payload={
            "action_run_id": action_run_id,
            "actor": approved_by,
            "steps_completed": steps_completed or ["commit_erp", "verification", "audit"],
        },
    )


# ---- Backwards-compatible LLM agent builder (kept for ADK pipeline use) ----
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

@FunctionTool
def write_audit_log(case_id: str, action_run_id: str, actor: str, event_type: str, payload: str) -> str:
    """Writes an immutable audit log entry."""
    try:
        data = {
            "case_id": case_id,
            "action_run_id": action_run_id,
            "actor": actor,
            "event_type": event_type,
            "payload": json.loads(payload)
        }
        res = supabase.table("audit_log").insert(data).execute()
        return json.dumps({"status": "success", "audit_id": res.data[0].get("id") if res.data else None})
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_audit_agent() -> LlmAgent:
    """Legacy LLM agent builder — kept for backwards compatibility."""
    return LlmAgent(
        name="audit_agent",
        description="Records all immutable state changes in the supply chain environment.",
        instruction="""You are the Audit Agent.
Your job is to:
1. Receive the outcome of the Verification Agent.
2. Call `write_audit_log` to permanently record the result of the action (e.g., event_type='commit_executed', payload={details}).
3. Output the final Audit Summary JSON.
""",
        model="gemini-2.5-flash",
        tools=[write_audit_log]
    )
