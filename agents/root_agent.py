from google.adk.agents import SequentialAgent
from backend.services.supabase_client import supabase

from agents.perception.agent import build_perception_pipeline
from agents.reasoning.agent import build_reasoning_coordinator
from agents.planning.agent import build_planning_coordinator
from agents.action.agent import build_action_coordinator
from agents.reflection.agent import build_reflection_coordinator

# The root pipeline ties all 5 layers together (used for full ADK flow if needed).
def build_omni_root_agent() -> SequentialAgent:
    perception = build_perception_pipeline()
    reasoning = build_reasoning_coordinator()
    planning = build_planning_coordinator()
    action = build_action_coordinator()
    reflection = build_reflection_coordinator()

    pipeline = SequentialAgent(
        name="omni_root_agent",
        description="Top-level ADK pipeline representing the full Omni system.",
        sub_agents=[
            perception,
            reasoning,
            planning,
            action,
            reflection
        ]
    )
    return pipeline


async def run_omni_pipeline(company_id: str, trigger: str, context: dict = None):
    """
    Legacy entry point. Live Simulation now uses agent_runner.run_risk_assessment
    which fetches real data and calls Gemini — no mock data.
    """
    # Real risk assessment is in backend.services.agent_runner.run_risk_assessment
    return {"status": "completed", "company_id": company_id}
