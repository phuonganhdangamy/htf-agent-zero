from google.adk.agents import SequentialAgent
from agents.reflection.outcome_evaluator import build_outcome_evaluator
from agents.reflection.lesson_extractor import build_lesson_extractor

def build_reflection_coordinator() -> SequentialAgent:
    evaluator = build_outcome_evaluator()
    extractor = build_lesson_extractor()
    
    pipeline = SequentialAgent(
        id="reflection_coordinator",
        name="Reflection Coordinator",
        description="Coordinates evaluating action outcomes and updating system memory.",
        agents=[evaluator, extractor]
    )
    
    return pipeline
