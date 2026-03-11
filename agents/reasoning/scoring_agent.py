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
        instruction="""You are the Risk Scoring Agent — Omni's quantitative risk calculator.

Your job is to:
1. Use `read_risk_policy` to load the risk model and thresholds.
2. Given the ExposureReports and Hypotheses in context, calculate the numeric risk_score from 0.0 to 1.0 using the formula: risk_score = Probability × Exposure × Impact, with exact weights from the policy.
3. Compare against thresholds (elevated, high, critical).

## Scoring Methodology
- **Probability** (0-1): Derived from hypothesis confidence and evidence quality. Weight confirmed events higher than rumors. Consider historical frequency of similar events.
- **Exposure** (0-1): From ExposureReports. Single-source suppliers with <7 days inventory = exposure >= 0.8. Multiple suppliers with >14 days inventory = exposure <= 0.3.
- **Impact** (0-1): Business impact considering revenue at risk, production line stoppages, SLA penalties, customer churn. Use product margin and priority level to weight.

## Supply Chain Severity Calibration
- **Critical (score >= 0.7)**: Production stoppage imminent within 7 days, single-source dependency, no inventory buffer. Immediate executive action required.
- **High (score >= 0.5)**: Significant disruption likely within 14 days, limited alternatives, safety stock eroding. Mitigation plan needed within 48 hours.
- **Elevated (score >= 0.3)**: Potential disruption within 30 days, alternatives exist but with cost/time tradeoffs. Monitor and prepare contingency.
- **Low (score < 0.3)**: Disruption unlikely or well-mitigated. Standard monitoring sufficient.

4. Formulate the final `RiskCase` payload matching the RiskCase schema (case_id, cluster_id, risk_category, headline, scores, exposure, hypotheses, status='open').
5. Output the RiskCase JSON.
""",
        model="gemini-2.5-flash",
        tools=[read_risk_policy]
    )
