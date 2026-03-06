import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def save_change_proposal(proposal_json: str) -> str:
    """Saves the structured ERP diff (ChangeProposal) to the database."""
    try:
        data = json.loads(proposal_json)
        res = supabase.table("change_proposals").insert(data).execute()
        return json.dumps({"status": "success", "proposal_id": res.data[0].get("proposal_id") if res.data else None})
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_change_proposal_agent() -> LlmAgent:
    return LlmAgent(
        name="change_proposal_agent",
        description="Translates the final execution plan into an exact ERP diff for systems like SAP/Oracle.",
        instruction="""You are the Change Proposal Agent.
Your job is to:
1. Receive the finalized execution plan from the Planning Layer.
2. Determine exactly what ERP entities must change (e.g., a specific PurchaseOrder, Inventory, Supplier).
3. Generate a JSON diff representing 'before' and 'after' state.
4. Output a JSON matching the ChangeProposal schema (proposal_id, action_run_id, system, entity_type, entity_id, diff, status='pending').
5. Call `save_change_proposal` to write it to the database.
""",
        model="gemini-2.5-flash",
        tools=[save_change_proposal]
    )
