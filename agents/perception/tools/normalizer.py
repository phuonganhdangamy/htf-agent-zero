import json
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def save_signal_events(events_json: str) -> str:
    """
    Saves a normalized list of SignalEvent JSON objects to the Supabase database.
    Events must match the canonical schema (event_id, event_type, country, severity_score, etc.).
    Input must be a JSON array string.
    """
    try:
        events = json.loads(events_json)
        if not isinstance(events, list):
            return json.dumps({"error": "Expected a JSON list of events."})
            
        saved = 0
        for ev in events:
            try:
                # Supabase will complain if keys don't match, so we should clean it potentially.
                # Assuming the LLM follows the db schema.
                supabase.table("signal_events").insert(ev).execute()
                saved += 1
            except Exception as e:
                print(f"Failed to insert event {ev.get('event_id', 'unknown')}: {e}")
                
        return json.dumps({"status": "success", "saved_count": saved})
    except Exception as e:
        return json.dumps({"error": str(e)})
