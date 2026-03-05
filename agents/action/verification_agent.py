import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import requests

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

def build_verification_agent() -> LlmAgent:
    return LlmAgent(
        id="verification_agent",
        name="Verification Agent",
        description="Post-commit checks to ensure ERP reflects the intended state.",
        instructions="""You are the Verification Agent.
Your job is to:
1. Retrieve the expected new state from the Change Proposal context.
2. Call `verify_erp_state` to fetch the actual current state of the modified entity.
3. Compare the two to ensure the operation succeeded.
4. Output a Verification Report.
""",
        model="gemini-2.5-flash",
        tools=[verify_erp_state]
    )
