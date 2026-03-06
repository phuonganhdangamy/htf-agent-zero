import json
from typing import List, Dict, Any

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

from backend.services.supabase_client import supabase
from agents.planning.optimization_engine import optimize_plans

@FunctionTool
def save_plans(plans_json: str, risk_case_id: str) -> str:
    """Saves the ranked candidate plans to Supabase as 'alternative_plans' for the risk_case."""
    try:
        plans = json.loads(plans_json)
        # Assuming we just update the case and set the highest ranked as recommended_plan
        recommended = plans[0].get("plan_type", "Unknown") if plans else ""
        
        supabase.table("risk_cases").update({
            "alternative_plans": plans,
            "recommended_plan": recommended
        }).eq("case_id", risk_case_id).execute()
        
        return json.dumps({"status": "success", "saved_plans": len(plans)})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def optimize_plans_tool(
    risk_case: Dict[str, Any],
    candidate_plans: List[Dict[str, Any]],
    simulations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Pure optimization step (not an agent).

    Given a RiskCase, a list of candidate plans, and their simulated outcomes,
    return the same plans ranked by feasibility_score using the shared objective
    function from agents.planning.optimization_engine.optimize_plans.
    """
    return optimize_plans(risk_case=risk_case, candidate_plans=candidate_plans, simulations=simulations)

def build_execution_planner() -> LlmAgent:
    return LlmAgent(
        name="execution_planner",
        description="Finalizes the ranked plans and formats them for approval handoff.",
        instruction="""You are the Execution Planner.
Your job is to:
1. Receive the candidate plans and their SimulationResults.
2. If the plans are not yet ranked, call `optimize_plans_tool` with:
   - the RiskCase JSON,
   - the list of candidate plans,
   - the list of SimulationResults,
   to compute a feasibility_score and sort the plans from best to worst.
3. Select the top-ranked plan as the recommended plan and keep the remaining plans as alternatives.
4. Break the recommended plan down into an explicit step-by-step Execution Plan.
5. Validate it against the risk_case details.
6. Call `save_plans` with the full ranked plan list so it is stored as:
   - `recommended_plan` (top plan)
   - `alternative_plans` (all plans, ranked)
""",
        model="gemini-2.5-flash",
        tools=[save_plans, optimize_plans_tool]
    )
