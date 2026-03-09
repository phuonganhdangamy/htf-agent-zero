import json
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase
from backend.services.signal_event_utils import ensure_start_date

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
        skipped = 0
        for ev in events:
            try:
                # Strip Reasoning Layer fields
                for field in ['company_exposed', 'severity_score', 'risk_score']:
                    if field in ev:
                        del ev[field]
                
                # Normalize tone to numeric
                if 'tone' in ev:
                    tone_val = ev['tone']
                    if isinstance(tone_val, str):
                        t_lower = tone_val.lower()
                        if 'negative' in t_lower:
                            ev['tone'] = -1.0
                        elif 'positive' in t_lower:
                            ev['tone'] = 1.0
                        elif 'neutral' in t_lower:
                            ev['tone'] = 0.0
                        else:
                            try:
                                ev['tone'] = float(tone_val)
                            except ValueError:
                                ev['tone'] = 0.0
                
                # Check for duplicate event_id
                event_id = ev.get('event_id')
                if not event_id:
                    continue
                    
                existing = supabase.table("signal_events").select("id").eq("event_id", event_id).execute()
                if existing.data and len(existing.data) > 0:
                    skipped += 1
                    continue

                ensure_start_date(ev)

                # Insert
                supabase.table("signal_events").insert(ev).execute()
                saved += 1
            except Exception as e:
                print(f"Warning: Failed to insert event {ev.get('event_id', 'unknown')}: {e}")
                
        summary = f"Summary: Saved {saved} events. Skipped {skipped} duplicates."
        print(summary)
        return json.dumps({"status": "success", "saved_count": saved, "skipped_count": skipped, "summary": summary})
    except Exception as e:
        print(f"Warning: Normalizer error: {str(e)}")
        return json.dumps({"error": str(e)})
