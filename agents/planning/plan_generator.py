import os
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

@FunctionTool
def get_action_library() -> str:
    """Returns the catalog of available mitigation actions from YAML."""
    policy_path = os.path.join(os.path.dirname(__file__), "action_library.yaml")
    try:
        with open(policy_path, "r") as f:
            return f.read()
    except Exception as e:
        return f"Error reading mapping: {e}"

def build_plan_generator() -> LlmAgent:
    return LlmAgent(
        name="plan_generator",
        description="Generates a list of candidate mitigation plans for a RiskCase based on available actions.",
        instruction="""You are the Plan Generator.
Your job is to:
1. Review the RiskCase output provided in context.
2. Use `get_action_library` to retrieve all feasible mitigation actions.
3. Combine 1 or more actions into 2-3 distinct candidate plans (e.g., 'Plan A: Expedite Air Freight', 'Plan B: Activate Backup Supplier').
4. Output the candidate plans as JSON (plan_id, plan_type, steps (list of actions), tradeoffs).
""",
        model="gemini-2.5-flash",
        tools=[get_action_library]
    )
