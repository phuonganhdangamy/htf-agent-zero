from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from backend.services.supabase_client import supabase

router = APIRouter()

class CreatePlanRequest(BaseModel):
    risk_case_id: str
    plan_type: str
    steps: List[str]
    expected_impact: str
    feasibility_score: float
    tradeoffs: List[str]

class ActionCreateRequest(BaseModel):
    risk_case_id: str
    plan_id: Optional[str] = None
    action_type: str
    description: str
    parameters: Optional[Dict[str, Any]] = None

@router.post("/risk_cases")
def create_risk_case(case: Dict[str, Any]):
    res = supabase.table("risk_cases").insert(case).execute()
    return res.data[0] if res.data else None

@router.post("/plan_options")
def create_plan_option(plan: CreatePlanRequest):
    # Depending on schema, we insert into alternative_plans of risk case
    # Here we are just mocking the update
    res = supabase.table("risk_cases").select("alternative_plans").eq("case_id", plan.risk_case_id).execute()
    if res.data:
        current_plans = res.data[0].get("alternative_plans", []) or []
        current_plans.append(plan.dict())
        supabase.table("risk_cases").update({"alternative_plans": current_plans}).eq("case_id", plan.risk_case_id).execute()
    return {"status": "success"}

@router.get("/risk_cases/{case_id}/plan_options")
def get_plan_options(case_id: str):
    res = supabase.table("risk_cases").select("alternative_plans").eq("case_id", case_id).execute()
    return res.data[0].get("alternative_plans", []) if res.data else []

@router.post("/actions")
def create_action(request: ActionCreateRequest):
    data = request.dict()
    data["status"] = "proposed"
    res = supabase.table("action_runs").insert({"case_id": request.risk_case_id, "plan_id": request.plan_id}).execute()
    return res.data[0] if res.data else None

@router.post("/actions/{action_id}/approve")
def approve_action(action_id: str, approved_by: str = "Admin"):
    # Mocking action workflow
    supabase.table("action_runs").update({"status": "approved"}).eq("id", action_id).execute()
    return {"status": "approved"}

@router.post("/actions/{action_id}/reject")
def reject_action(action_id: str, rejected_by: str = "Admin"):
    supabase.table("action_runs").update({"status": "rejected"}).eq("id", action_id).execute()
    return {"status": "rejected"}

@router.post("/actions/{action_id}/execute")
def execute_action(action_id: str):
    supabase.table("action_runs").update({"status": "executed"}).eq("id", action_id).execute()
    return {"status": "executed"}
