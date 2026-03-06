from google.adk.agents import LlmAgent

def build_scenario_simulator() -> LlmAgent:
    return LlmAgent(
        name="scenario_simulator",
        description="Simulates the outcomes of the candidate plans.",
        instruction="""You are the Scenario Simulator.
Your job is to:
1. Receive candidate plans from the Plan Generator.
2. For each plan, predict the outcome on the business context (e.g., reduction in delay risk, expected cost based on action multipliers, and estimated loss prevented).
3. Output the SimulationResult for each plan as JSON (plan_id, expected_risk_reduction, expected_cost, expected_loss_prevented, confidence).
""",
        model="gemini-2.5-flash"
    )
