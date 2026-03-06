import json
import os
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import requests

def _report_step_complete(action_run_id: str, step_index: int, status: str = "DONE") -> str:
    """Write step status back to Supabase via backend API."""
    base = os.environ.get("BACKEND_URL", "http://localhost:8000")
    url = f"{base}/api/agent/action_runs/{action_run_id}/steps"
    try:
        r = requests.patch(url, json={"step_index": step_index, "status": status}, timeout=10)
        return json.dumps({"status": "ok", "response": r.json() if r.ok else r.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def verify_erp_state(entity_type: str, entity_id: str) -> str:
    """
    Fetches the current state of an entity from the ERP to verify changes.
    """
    try:
        url = ""
        if entity_type == "PurchaseOrder":
            url = f"http://localhost:8000/api/erp/purchase-orders/{entity_id}"
        elif entity_type == "Inventory":
            url = f"http://localhost:8000/api/erp/inventory/{entity_id}"
            
        if url:
            res = requests.get(url, timeout=10)
            res.raise_for_status()
            return json.dumps(res.json())
        return json.dumps({"error": "Unknown entity type"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def report_step_complete(action_run_id: str, step_index: int, status: str = "DONE") -> str:
    """Call after verification completes to update action_runs.steps. step_index is 0-based (e.g. 7 for VerificationAgent step 8)."""
    return _report_step_complete(action_run_id, step_index, status)


def build_verification_agent() -> LlmAgent:
    return LlmAgent(
        name="verification_agent",
        description="Post-commit checks to ensure ERP reflects the intended state.",
        instruction="""You are the Verification Agent.
Your job is to:
1. Retrieve the expected new state from the Change Proposal context.
2. Call `verify_erp_state` to fetch the actual current state of the modified entity.
3. Compare the two to ensure the operation succeeded.
4. Output a Verification Report.
5. Call report_step_complete(action_run_id, 7, "DONE") when verification is done (step 8 = index 7).
""",
        model="gemini-2.5-flash",
        tools=[verify_erp_state, report_step_complete]
    )
