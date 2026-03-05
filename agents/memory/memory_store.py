import json
from backend.services.supabase_client import supabase

def query_patterns(event_type: str, subtype: str, region: str) -> list:
    """
    Returns matching memory_patterns rows ordered by confidence desc.
    """
    try:
        # Simplistic match for demo
        res = supabase.table("memory_patterns") \
            .select("*") \
            .order("confidence", desc=True) \
            .limit(5) \
            .execute()
        return res.data
    except Exception as e:
        print(f"Memory Query Error: {e}")
        return []

def update_from_reflection(outcome_evaluation: dict, lesson_learned: dict) -> bool:
    """
    Upserts pattern and entity memory rows based on reflection.
    """
    try:
        if lesson_learned and "pattern_id" in lesson_learned:
            supabase.table("memory_patterns").upsert({
                "pattern_id": lesson_learned["pattern_id"],
                "trigger_conditions": lesson_learned.get("conditions", {}),
                "recommended_actions": lesson_learned.get("recommended", []),
                "avoid_actions": lesson_learned.get("avoid", []),
                "confidence": outcome_evaluation.get("actual_risk_reduction", 0.5)
            }).execute()
        return True
    except Exception as e:
        print(f"Memory Update Error: {e}")
        return False
