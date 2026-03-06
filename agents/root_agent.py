import json
from google.adk.agents import SequentialAgent
from backend.services.supabase_client import supabase

from agents.perception.agent import build_perception_pipeline
from agents.reasoning.agent import build_reasoning_coordinator
from agents.planning.agent import build_planning_coordinator
from agents.action.agent import build_action_coordinator
from agents.reflection.agent import build_reflection_coordinator
from agents.memory.preference_memory import get_org_preferences

# The root pipeline ties all 5 layers together.
def build_omni_root_agent() -> SequentialAgent:
    perception = build_perception_pipeline()
    reasoning = build_reasoning_coordinator()
    planning = build_planning_coordinator()
    action = build_action_coordinator()
    reflection = build_reflection_coordinator()
    
    # In a full ADK setup, you might pass context explicitly between these agents
    # or rely on a shared scratchpad/DB state. Here we assemble the sequence.
    pipeline = SequentialAgent(
        id="omni_root_agent",
        name="Omni Autonomous Agent",
        description="Top-level ADK pipeline representing the full Omni system.",
        agents=[
            perception,
            reasoning,
            planning,
            action,
            reflection
        ]
    )
    
    return pipeline

async def run_omni_pipeline(company_id: str, trigger: str, context: dict = None):
    """
    Executes the full Omni pipeline. Pulled into agent session context.
    """
    print(f"Initializing Omni pipeline for {company_id} triggered by {trigger}")
    
    # 1. Fetch Business Snapshot for Session Context
    try:
        org_prefs = get_org_preferences(company_id)
        supplier_res = supabase.table("suppliers").select("*").execute()
        facilities_res = supabase.table("facilities").select("*").execute()
        inventory_res = supabase.table("inventory").select("*").execute()
        routes_res = supabase.table("transport_routes").select("*").execute()
        
        session_context = {
            "company_id": company_id,
            "trigger": trigger,
            "preferences": org_prefs,
            "suppliers": supplier_res.data,
            "facilities": facilities_res.data,
            "inventory": inventory_res.data,
            "routes": routes_res.data,
            "extra_context": context or {}
        }
        
    except Exception as e:
        print(f"Failed to load business snapshot: {e}")
        session_context = {}
        
    print(f"Loaded snapshot with {len(session_context.get('suppliers', []))} suppliers.")
    
    root_agent = build_omni_root_agent()
    
    # ADK's actual invocation syntax depends on the exact framework version,
    # but theoretically would use .run or .async_stream_query with context.
    # For prototype purposes, we mock the synchronous invocation to demonstrate flow.
    # res = await root_agent.async_stream_query("Run full pipeline", context=session_context)
    
    import uuid
    from datetime import datetime
    
    # 1. Generate a mock Risk Case
    case_id = f"CASE-{str(uuid.uuid4())[:8].upper()}"
    supabase.table("risk_cases").insert({
        "id": case_id,
        "case_id": case_id,
        "cluster_id": "CLUSTER_001",
        "risk_category": "Supply Chain Disruption",
        "headline": f"Potential Disruption from Trigger: {trigger[:50]}...",
        "status": "open",
        "scores": {"impact": 85, "probability": 70, "overall_risk": 78},
        "exposure": {"affected_suppliers": ["SUPP_044"], "affected_materials": ["MAT_001"]},
        "hypotheses": [{"title": "Component Shortage", "description": "Delay in MAT_001 delivery"}],
        "recommended_plan": "Expedite backup supplier PO and route via air freight.",
        "expected_risk_reduction": 45.0,
        "expected_cost": 12500.0,
        "expected_loss_prevented": 500000.0,
        "execution_steps": [{"step": 1, "action": "Draft PO for SUPP_012"}]
    }).execute()
    
    # 2. Generate an Action Run & Proposal
    action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    
    supabase.table("action_runs").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "status": "drafted"
    }).execute()
    
    supabase.table("change_proposals").insert({
        "proposal_id": proposal_id,
        "action_run_id": action_run_id,
        "system": "SAP S/4HANA",
        "entity_type": "PurchaseOrder",
        "entity_id": "PO_NEW_8823",
        "diff": {"material": "MAT_001", "quantity": 10000, "supplier": "SUPP_012", "mode": "air"},
        "risk": {"confidence": 0.92, "financial_impact": 12500.0},
        "status": "pending"
    }).execute()
    
    print("Omni Pipeline execution simulated and mock data injected.")
    return {"status": "completed", "company_id": company_id}

