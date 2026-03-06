import json
import os
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import requests

def _report_step_complete(action_run_id: str, step_index: int, status: str = "DONE", artifact_id: str = None) -> str:
    """Write step status back to Supabase via backend API."""
    base = os.environ.get("BACKEND_URL", "http://localhost:8000")
    url = f"{base}/api/agent/action_runs/{action_run_id}/steps"
    payload = {"step_index": step_index, "status": status}
    if artifact_id:
        payload["artifact_id"] = artifact_id
    try:
        r = requests.patch(url, json=payload, timeout=10)
        return json.dumps({"status": "ok", "response": r.json() if r.ok else r.text})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def execute_erp_commit(proposal_id: str, entity_type: str, entity_id: str, changes: str, approved_by: str) -> str:
    """
    Executes the approved change proposal against the backend ERP APIs.
    Requires approved_by to not be empty.
    """
    if not approved_by:
        return json.dumps({"error": "Cannot commit without approved_by credentials."})
        
    # We call the FastAPI backend to make the change
    # e.g., PUT /api/erp/purchase-orders/{po_id}
    try:
        updates = json.loads(changes)
        if entity_type == "PurchaseOrder":
            url = f"http://localhost:8000/api/erp/purchase-orders/{entity_id}"
            res = requests.put(url, json=updates, timeout=10)
            res.raise_for_status()
            return json.dumps({"status": "success", "result": res.json()})
        else:
            return json.dumps({"error": f"Unsupported entity type {entity_type} for automatic commit."})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def report_step_complete(action_run_id: str, step_index: int, status: str = "DONE", artifact_id: str = "") -> str:
    """Call after a step completes to update action_runs.steps in Supabase. step_index is 0-based (e.g. 3 for step 4)."""
    return _report_step_complete(action_run_id, step_index, status, artifact_id or None)


def build_commit_agent() -> LlmAgent:
    return LlmAgent(
        name="commit_agent",
        description="Executes ERP changes. Strictly requires human approval token.",
        instruction="""You are the Commit Agent.
Your job is to:
1. Ensure you have an approval signal from the Approval Agent (including `approved_by`).
2. If approved, extract the `diff` (changes) from the Change Proposal.
3. Call `execute_erp_commit` to push those changes to the mock ERP.
4. Output the result of the commit.
5. Call report_step_complete(action_run_id, step_index, "DONE") when the commit step has finished (step_index: 3 for email send, 6 for ERP write).
If you do not have approval, you MUST NOT proceed.
""",
        model="gemini-2.5-flash",
        tools=[execute_erp_commit, report_step_complete]
    )
