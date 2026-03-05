import json
from backend.services.supabase_client import supabase

def get_org_preferences(org_id: str) -> dict:
    """
    Fetches org config, approval policies, forbidden regions.
    """
    try:
        res = supabase.table("memory_preferences").select("*").eq("org_id", org_id).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        print(f"Failed to fetch preferences: {e}")
        return {}
