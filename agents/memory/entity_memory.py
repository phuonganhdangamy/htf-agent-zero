import json
from backend.services.supabase_client import supabase

def get_entity_stats(entity_type: str, entity_id: str) -> str:
    """
    Fetches supplier/route reliability stats.
    """
    try:
        res = supabase.table("memory_entities").select("*").eq("entity_type", entity_type).eq("entity_id", entity_id).execute()
        return json.dumps(res.data[0] if res.data else {})
    except Exception as e:
        return json.dumps({"error": str(e)})
