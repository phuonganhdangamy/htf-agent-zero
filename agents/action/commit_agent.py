import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import requests

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

def build_commit_agent() -> LlmAgent:
    return LlmAgent(
        id="commit_agent",
        name="Commit Agent",
        description="Executes ERP changes. Strictly requires human approval token.",
        instructions="""You are the Commit Agent.
Your job is to:
1. Ensure you have an approval signal from the Approval Agent (including `approved_by`).
2. If approved, extract the `diff` (changes) from the Change Proposal.
3. Call `execute_erp_commit` to push those changes to the mock ERP.
4. Output the result of the commit.
If you do not have approval, you MUST NOT proceed.
""",
        model="gemini-2.5-flash",
        tools=[execute_erp_commit]
    )
