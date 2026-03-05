import json

def get_pattern_hints(event_type: str, subtype: str, region: str) -> str:
    """
    Fetches situational patterns from memory to hint the planner.
    """
    from agents.memory.memory_store import query_patterns
    patterns = query_patterns(event_type, subtype, region)
    return json.dumps(patterns)
