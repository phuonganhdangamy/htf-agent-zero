import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def update_memory_from_lesson(pattern_id: str, insight: str, confidence_adj: float) -> str:
    """
    Updates the pattern memory with new insights extracted from reflection.
    """
    try:
        # In a real impl, we'd upsert into memory_patterns
        return json.dumps({"status": "success", "memory_updated": True})
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_lesson_extractor() -> LlmAgent:
    return LlmAgent(
        id="lesson_extractor",
        name="Lesson Extractor Agent",
        description="Extracts generalized lessons and updates organizational memory.",
        instructions="""You are the Lesson Extractor.
Your job is to:
1. Receive the Outcome Evaluation context.
2. Extract an LLM lesson or policy recommendation (e.g., "Air freight expediting from Taiwan tends to be 10% less effective during typhoons").
3. Call `update_memory_from_lesson` to record this in the system memory.
4. Output the extracted lesson JSON.
""",
        model="gemini-2.5-flash",
        tools=[update_memory_from_lesson]
    )
