"""
Change Proposal Agent — converted from LLM agent to deterministic tool.

Translates an execution plan into an ERP diff and saves it. This is a
rule-based operation (no LLM reasoning needed): given a plan with actions,
generate the corresponding before/after ERP state diff.
"""
import json
import uuid
from typing import Dict, Any, Optional
from backend.services.supabase_client import supabase


def generate_erp_diff(
    action_run_id: str,
    plan: Dict[str, Any],
    system: str = "Omni",
    entity_type: str = "Procurement",
) -> Dict[str, Any]:
    """
    Deterministic function: generates an ERP diff from a plan and saves it
    as a change_proposal. No LLM needed.

    Args:
        action_run_id: The action run this proposal belongs to
        plan: The recommended_plan dict (plan_id, name, actions, expected_cost_usd, etc.)
        system: ERP system name
        entity_type: Entity type being modified

    Returns:
        Dict with proposal_id and status
    """
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    entity_id = plan.get("plan_id", "PLAN_A")

    # Build the diff from plan actions
    diff = {
        "plan_id": entity_id,
        "name": plan.get("name", "Mitigation Plan"),
        "actions": plan.get("actions", []),
        "expected_cost_usd": plan.get("expected_cost_usd"),
        "expected_loss_prevented_usd": plan.get("expected_loss_prevented_usd"),
        "expected_delay_days": plan.get("expected_delay_days"),
        "service_level": plan.get("service_level"),
    }

    # Extract risk info from plan if available
    risk = {
        "confidence": plan.get("confidence", 80),
        "financial_impact": plan.get("expected_cost_usd"),
    }

    row = {
        "proposal_id": proposal_id,
        "action_run_id": action_run_id,
        "system": system,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "diff": diff,
        "risk": risk,
        "status": "pending",
    }

    try:
        res = supabase.table("change_proposals").insert(row).execute()
        return {
            "status": "success",
            "proposal_id": proposal_id,
            "data": res.data[0] if res.data else row,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "proposal_id": proposal_id}


def save_change_proposal_direct(proposal_data: Dict[str, Any]) -> Dict[str, Any]:
    """Direct insert of a pre-built proposal dict. No LLM needed."""
    try:
        res = supabase.table("change_proposals").insert(proposal_data).execute()
        return {
            "status": "success",
            "proposal_id": res.data[0].get("proposal_id") if res.data else None,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ---- Backwards-compatible LLM agent builder (kept for ADK pipeline use) ----
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

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
    """Legacy LLM agent builder — kept for backwards compatibility."""
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
