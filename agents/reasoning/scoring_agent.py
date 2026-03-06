from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import yaml
import os

@FunctionTool
def read_risk_policy() -> str:
    """Reads the organization's risk policy YAML file containing scoring weights."""
    policy_path = os.path.join(os.path.dirname(__file__), "risk_policy.yaml")
    try:
        with open(policy_path, "r") as f:
            return f.read()
    except Exception as e:
        return f"Error reading policy: {e}"

def build_scoring_agent() -> LlmAgent:
    return LlmAgent(
        name="scoring_agent",
        description="Calculates the final Risk Score (P × E × I) using the risk policy YAML.",
        instruction="""You are the Risk Scoring Agent.
Your job is to:
1. Use `read_risk_policy` to load the risk model and thresholds.
2. Given the ExposureReports and Hypotheses in context, calculate the numeric risk_score from 0.0 to 1.0 (Probability * Exposure * Impact) using the exact weights in the policy.
3. Compare against thresholds (elevated, high, critical).
4. Formulate the final `RiskCase` payload matching the RiskCase schema (case_id, cluster_id, risk_category, headline, scores, exposure, hypotheses, status='open').
5. Output the RiskCase JSON.
""",
        model="gemini-2.5-flash",
        tools=[read_risk_policy]
    )
