from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from backend.services.supabase_client import supabase
from backend.services.agent_runner import run_pipeline

router = APIRouter()

class RunRequest(BaseModel):
    company_id: str
    trigger: str
    context: Optional[Dict[str, Any]] = None

class ApproveRequest(BaseModel):
    proposal_id: str
    approved_by: str
    decision: str  # "approve" | "reject"

@router.post("/run")
async def run_agent(request: RunRequest):
    result = await run_pipeline(request.company_id, request.trigger, request.context)
    return result

@router.get("/cases")
def get_cases():
    response = supabase.table("risk_cases").select("*").order("created_at", desc=True).execute()
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

@router.get("/audit/{case_id}")
def get_audit(case_id: str):
    response = supabase.table("audit_log").select("*").eq("case_id", case_id).order("created_at", desc=True).execute()
    return response.data
