from google.adk.agents import SequentialAgent
from agents.planning.plan_generator import build_plan_generator
from agents.planning.scenario_simulator import build_scenario_simulator
from agents.planning.execution_planner import build_execution_planner

def build_planning_coordinator() -> SequentialAgent:
    # Note: optimization_engine.py is a pure Python function.
    # We can either weave it into the pipeline via a tool called by the execution_planner
    # or rely on the LLM to do the scoring using instructions. 
    # For a purely sequential agent flow without custom Python interleaving in ADK, we rely on the agents.
    
    plan_generator = build_plan_generator()
    scenario_simulator = build_scenario_simulator()
    execution_planner = build_execution_planner()
    
    pipeline = SequentialAgent(
        id="planning_coordinator",
        name="Planning Coordinator",
        description="Coordinates risk mitigation planning.",
        agents=[plan_generator, scenario_simulator, execution_planner]
    )
    
    return pipeline
