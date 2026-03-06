import os
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
from google import genai
from google.genai import types
from backend.services.supabase_client import supabase

router = APIRouter()

# Initialize Gemini Client
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    # default for local testing if env is not loaded correctly
    api_key = os.environ.get("backend_API_KEY", "")

client = genai.Client(api_key=api_key)

COMPANY_PROFILE = {
    "company_name": "Omni Manufacturing",
    "industry": "electronics assembly",
    "risk_appetite": "medium",
    "fill_rate_target": 0.95,
    "cost_cap_usd": 50000,
}

def get_supply_chain_snapshot():
    """Fetches real data from Supabase to form the context snapshot."""
    suppliers_res = supabase.table("suppliers").select("*").execute()
    facilities_res = supabase.table("facilities").select("*").execute()
    
    # If DB is empty, provide the default mock snapshot
    suppliers = suppliers_res.data if suppliers_res.data else [
        {"id": "SUPP_044", "location": "Kaohsiung, Taiwan", "material": "microchips", "criticality_score": 92, "single_source": True, "lead_time_days": 30},
        {"id": "SUPP_012", "location": "South Korea", "material": "microchips", "backup_supplier": True, "lead_time_days": 60},
        {"id": "SUPP_021", "location": "Japan", "material": "microchips", "backup_supplier": True, "lead_time_days": 45},
    ]
    
    facilities = facilities_res.data if facilities_res.data else [
        {"id": "FAC_DE_01", "location": "Germany", "type": "assembly plant"},
        {"id": "DC_DE_01", "location": "Germany", "type": "warehouse", "inventory_days_remaining": 4.2, "safety_stock_days": 10},
    ]
    
    return {
        "suppliers": suppliers,
        "facilities": facilities,
        "product": {"id": "PROD_001", "margin": "38%", "priority": "high"},
        "transport_route": "Taiwan → Germany (sea)",
        "transit_time_days": 14,
        "open_purchase_orders": [
            {"id": "PO_8821", "eta": "2026-03-20"},
            {"id": "PO_8822", "eta": "2026-04-05"},
        ],
    }

@router.post("/perception")
def run_perception():
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents='Simulate a global disruption signal relevant to microchip suppliers in Taiwan, South Korea, or Japan. Output a SignalEvent JSON.',
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "event_id": types.Schema(type=types.Type.STRING),
                        "event_type": types.Schema(type=types.Type.STRING),
                        "location": types.Schema(type=types.Type.STRING),
                        "severity_score": types.Schema(type=types.Type.NUMBER),
                        "confidence_score": types.Schema(type=types.Type.NUMBER),
                        "evidence_links": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
                        "summary": types.Schema(type=types.Type.STRING),
                        "reasoning": types.Schema(type=types.Type.STRING, description="Short explanation of why this event was flagged.")
                    },
                    required=["event_id", "event_type", "location", "severity_score", "confidence_score", "evidence_links", "summary", "reasoning"]
                )
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reasoning")
def run_reasoning(signal_event: Dict[str, Any]):
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Analyze this SignalEvent: {json.dumps(signal_event)}. Determine exposure for Omni Manufacturing. Risk formula: risk_score = probability × exposure × impact. Output a RiskCase JSON.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "case_id": types.Schema(type=types.Type.STRING),
                        "event_ids": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
                        "affected_assets": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
                        "probability_score": types.Schema(type=types.Type.NUMBER),
                        "impact_score": types.Schema(type=types.Type.NUMBER),
                        "risk_score": types.Schema(type=types.Type.NUMBER),
                        "explanation": types.Schema(type=types.Type.STRING),
                        "reasoning": types.Schema(type=types.Type.STRING)
                    },
                    required=["case_id", "event_ids", "affected_assets", "probability_score", "impact_score", "risk_score", "explanation", "reasoning"]
                )
            ),
        )
        result = json.loads(response.text)
        
        # Insert into Supabase real database
        case_id = f"CASE-{str(uuid.uuid4())[:8].upper()}"
        result["case_id"] = case_id
        
        try:
            supabase.table("risk_cases").insert({
                "id": case_id,
                "case_id": case_id,
                "cluster_id": "CLUSTER_SIM",
                "risk_category": "Supply Chain Disruption",
                "headline": f"Simulated Risk: {signal_event.get('event_type')} in {signal_event.get('location')}",
                "status": "open",
                "scores": {
                    "impact": result.get("impact_score", 0) * 100, 
                    "probability": result.get("probability_score", 0) * 100, 
                    "overall_risk": result.get("risk_score", 0) * 100
                },
                "exposure": {"affected_assets": result.get("affected_assets", [])},
                "hypotheses": [{"title": "Simulated Impact", "description": result.get("explanation", "")}],
                "expected_loss_prevented": 500000.0,
            }).execute()
        except Exception as db_e:
            print(f"Non-fatal error inserting to risk_cases: {db_e}")

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/planning")
def run_planning(risk_case: Dict[str, Any]):
    try:
        snapshot = get_supply_chain_snapshot()
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Generate mitigation strategies for this RiskCase: {json.dumps(risk_case)}. Use the Supply Chain Snapshot: {json.dumps(snapshot)}. Output PlanOptions JSON.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "plans": types.Schema(
                            type=types.Type.ARRAY,
                            items=types.Schema(
                                type=types.Type.OBJECT,
                                properties={
                                    "plan_id": types.Schema(type=types.Type.STRING),
                                    "plan_type": types.Schema(type=types.Type.STRING),
                                    "steps": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
                                    "estimated_cost": types.Schema(type=types.Type.NUMBER),
                                    "expected_risk_reduction": types.Schema(type=types.Type.NUMBER)
                                },
                                required=["plan_id", "plan_type", "steps", "estimated_cost", "expected_risk_reduction"]
                            )
                        ),
                        "reasoning": types.Schema(type=types.Type.STRING)
                    },
                    required=["plans", "reasoning"]
                )
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/action")
def run_action(plan_options: Dict[str, Any]):
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Choose the best plan from: {json.dumps(plan_options)}. Cost cap is {COMPANY_PROFILE['cost_cap_usd']}. Output ActionProposal JSON.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "action_id": types.Schema(type=types.Type.STRING),
                        "plan_id": types.Schema(type=types.Type.STRING),
                        "action_type": types.Schema(type=types.Type.STRING),
                        "description": types.Schema(type=types.Type.STRING),
                        "status": types.Schema(type=types.Type.STRING),
                        "reasoning": types.Schema(type=types.Type.STRING)
                    },
                    required=["action_id", "plan_id", "action_type", "description", "status", "reasoning"]
                )
            ),
        )
        result = json.loads(response.text)
        
        # Insert Action and Proposal to DB if there's an active risk case context
        action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
        proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
        
        try:
            supabase.table("action_runs").insert({
                "action_run_id": action_run_id,
                "case_id": "CASE-SIMULATION",  # Usually passed from previous step
                "status": "drafted"
            }).execute()
            
            supabase.table("change_proposals").insert({
                "proposal_id": proposal_id,
                "action_run_id": action_run_id,
                "system": "SAP S/4HANA",
                "entity_type": result.get("action_type", "Adjustment"),
                "entity_id": result.get("action_id", "ACT_001"),
                "diff": {"description": result.get("description", "")},
                "status": "pending"
            }).execute()
        except Exception as db_e:
            print(f"Non-fatal error inserting to proposals: {db_e}")

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reflection")
def run_reflection(payload: Dict[str, Any]):
    try:
        action_proposal = payload.get("action_proposal", {})
        risk_case = payload.get("risk_case", {})
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Evaluate the effectiveness of this action: {json.dumps(action_proposal)} against this risk: {json.dumps(risk_case)}. Output OutcomeEvaluation JSON.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "prediction_accuracy": types.Schema(type=types.Type.NUMBER),
                        "outcome": types.Schema(type=types.Type.STRING),
                        "root_cause": types.Schema(type=types.Type.STRING),
                        "lessons_learned": types.Schema(type=types.Type.STRING),
                        "reasoning": types.Schema(type=types.Type.STRING)
                    },
                    required=["prediction_accuracy", "outcome", "root_cause", "lessons_learned", "reasoning"]
                )
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
