from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from backend.services.supabase_client import supabase
from backend.services.agent_runner import run_pipeline, rerun_plan_only, abandon_scenario
from backend.services.action_steps import get_steps, update_step
from backend.services.action_orchestrator import advance_after_approval

router = APIRouter()

class RunRequest(BaseModel):
    company_id: str
    trigger: str
    context: Optional[Dict[str, Any]] = None
    scenario_text: Optional[str] = None
    scenario: Optional[str] = None
    severity: Optional[int] = None
    urgency: Optional[int] = None
    order_volume: Optional[str] = None
    timeline: Optional[str] = None
    budget_flexibility: Optional[str] = None
    risk_tolerance: Optional[str] = None
    focus_suppliers: Optional[List[str]] = None
    focus_materials: Optional[List[str]] = None
    flagged_regions: Optional[List[str]] = None
    directives: Optional[Dict[str, bool]] = None

class ApproveRequest(BaseModel):
    proposal_id: str
    approved_by: str
    decision: str  # "approve" | "reject"

class RerunRequest(BaseModel):
    case_id: str
    rejection_reason: str = "No reason given"
    feedback_text: Optional[str] = None
    constraint_overrides: Optional[Dict[str, Any]] = None
    actor: Optional[str] = "Administrator"

class AbandonRequest(BaseModel):
    case_id: str
    actor: Optional[str] = "Administrator"
    reason: Optional[str] = None

@router.post("/run")
async def run_agent(request: RunRequest):
    context = request.context or {}
    scenario_text = request.scenario_text or request.scenario or request.trigger or ""
    context["scenario_text"] = scenario_text
    if request.severity is not None:
        context["severity"] = request.severity
    if request.urgency is not None:
        context["urgency"] = request.urgency
    if request.order_volume is not None:
        context["order_volume"] = request.order_volume
    if request.timeline is not None:
        context["timeline"] = request.timeline
    if request.budget_flexibility is not None:
        context["budget_flexibility"] = request.budget_flexibility
    if request.risk_tolerance is not None:
        context["risk_tolerance"] = request.risk_tolerance
    if request.focus_suppliers is not None:
        context["focus_suppliers"] = request.focus_suppliers
    if request.focus_materials is not None:
        context["focus_materials"] = request.focus_materials
    if request.flagged_regions is not None:
        context["flagged_regions"] = request.flagged_regions
    if request.directives is not None:
        context["directives"] = request.directives
    result = await run_pipeline(request.company_id, request.trigger, context)
    return result

@router.get("/cases")
def get_cases(status: Optional[str] = None, limit: int = 10, order: str = "created_at.desc"):
    query = supabase.table("risk_cases").select("*")
    if status:
        query = query.eq("status", status)
    order_col, order_dir = order.split(".") if "." in order else ("created_at", "desc")
    query = query.order(order_col, desc=(order_dir == "desc")).limit(limit)
    response = query.execute()
    return response.data

@router.get("/cases/{case_id}")
def get_case(case_id: str):
    response = supabase.table("risk_cases").select("*").eq("case_id", case_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Risk Case not found")
    return response.data[0]

@router.post("/approve")
def approve_action(request: ApproveRequest):
    if request.decision not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Decision must be 'approve' or 'reject'")
        
    status = "approved" if request.decision == "approve" else "rejected"
    
    # Update proposal status
    update_res = supabase.table("change_proposals").update({
        "status": status,
        "approved_by": request.approved_by,
        "approved_at": "now()"
    }).eq("proposal_id", request.proposal_id).execute()
    
    if not update_res.data:
        raise HTTPException(status_code=404, detail="Proposal not found")
        
    proposal = update_res.data[0]
    
    # Write audit log
    supabase.table("audit_log").insert({
        "action_run_id": proposal.get("action_run_id"),
        "actor": request.approved_by,
        "event_type": f"proposal_{status}",
        "payload": {"proposal_id": request.proposal_id, "decision": request.decision}
    }).execute()
    
    return {"status": "success", "proposal": proposal}

@router.post("/rerun")
async def rerun_with_feedback(request: RerunRequest):
    try:
        result = await rerun_plan_only(
            case_id=request.case_id,
            rejection_reason=request.rejection_reason or "No reason given",
            feedback_text=request.feedback_text or "",
            constraint_overrides=request.constraint_overrides or {},
            actor=request.actor or "Administrator",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/abandon")
async def abandon_scenario_route(request: AbandonRequest):
    try:
        result = await abandon_scenario(
            case_id=request.case_id,
            actor=request.actor or "Administrator",
            reason=request.reason or "",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/audit/{case_id}")
def get_audit(case_id: str):
    response = supabase.table("audit_log").select("*").eq("case_id", case_id).order("created_at", desc=True).execute()
    return response.data


class StepUpdateBody(BaseModel):
    step_index: int
    status: str  # DONE | PENDING | LOCKED
    timestamp: Optional[str] = None
    artifact_id: Optional[str] = None


@router.get("/action_runs/{action_run_id}/steps")
def get_action_run_steps(action_run_id: str):
    steps = get_steps(action_run_id)
    return {"action_run_id": action_run_id, "steps": steps}


@router.patch("/action_runs/{action_run_id}/steps")
def patch_action_run_step(action_run_id: str, body: StepUpdateBody):
    updated = update_step(
        action_run_id=action_run_id,
        step_index=body.step_index,
        status=body.status,
        timestamp=body.timestamp,
        artifact_id=body.artifact_id,
    )
    return {"action_run_id": action_run_id, "steps": updated}


class AdvanceBody(BaseModel):
    step_index: int
    approved_by: str = "Omni Admin"


@router.post("/action_runs/{action_run_id}/advance")
def advance_action_run(action_run_id: str, body: AdvanceBody):
    """
    Called when a human approves a PENDING step in the action breakdown.
    Marks the step DONE, unlocks the next step, and runs any automated agents
    for the subsequent step(s) according to the action layer spec.
    """
    result = advance_after_approval(
        action_run_id=action_run_id,
        step_index=body.step_index,
        approved_by=body.approved_by,
    )
    return result
