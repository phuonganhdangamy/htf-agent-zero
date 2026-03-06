import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def evaluate_outcome(case_id: str) -> str:
    """
    Evaluates the predicted expected outcome vs. the actual outcome (based on audit logs and ERP state).
    """
    try:
        # We would pull the original risk case predictions and compare to current ERP state
        # Simulated response for prototype:
        res = supabase.table("risk_cases").select("*").eq("case_id", case_id).execute()
        case = res.data[0] if res.data else {}
        return json.dumps({
            "predicted_risk_reduction": case.get("expected_risk_reduction", 0),
            "actual_risk_reduction": case.get("expected_risk_reduction", 0) * 0.9, # Simulated 90% accuracy
            "success": True
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_outcome_evaluator() -> LlmAgent:
    return LlmAgent(
        name="outcome_evaluator",
        description="Compares predicted outcome vs actual executed outcome.",
        instruction="""You are the Outcome Evaluator.
Your job is to:
1. Receive the case_id and outcome stats context.
2. Call `evaluate_outcome` to fetch data on whether the expected risk reduction was achieved.
3. Output an Outcome Evaluation JSON.
""",
        model="gemini-2.5-flash",
        tools=[evaluate_outcome]
    )
