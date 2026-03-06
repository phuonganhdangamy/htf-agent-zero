import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

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

def build_execution_planner() -> LlmAgent:
    return LlmAgent(
        name="execution_planner",
        description="Finalizes the ranked plans and formats them for approval handoff.",
        instruction="""You are the Execution Planner.
Your job is to:
1. Receive the mathematically ranked plans from the Optimization Engine.
2. Select the top plan and break it down into an explicit step-by-step Execution Plan.
3. Validate it against the risk_case details.
4. Output the final plan structure and call `save_plans` to update the database.
""",
        model="gemini-2.5-flash",
        tools=[save_plans]
    )
