import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_acled_conflict_events(countries: list[str]) -> str:
    """
    Fetches conflict and protest events from ACLED for specific countries.
    Requires ACLED_USERNAME (email) and ACLED_PASSWORD (key).
    """
    email = os.environ.get("ACLED_USERNAME")
    password = os.environ.get("ACLED_PASSWORD")
    if not email or not password:
        print("Warning: ACLED credentials missing. Provide ACLED_USERNAME and ACLED_PASSWORD.")
        return json.dumps([])
        
    try:
        # 1. Authenticate via OAuth
        token_url = "https://acleddata.com/oauth/token"
        auth_data = {
            "username": email,
            "password": password,
            "grant_type": "password",
            "client_id": "acled"
        }
        auth_res = requests.post(token_url, data=auth_data, timeout=10)
        auth_res.raise_for_status()
        token = auth_res.json()["access_token"]
    except Exception as e:
        print(f"Warning: ACLED auth error: {str(e)}")
        return json.dumps([])
        
    url = "https://acleddata.com/api/acled/read"
    events = []
    
    try:
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        for country in countries:
            params = {
                "country": country,
                "limit": 5,
                "_format": "json"
            }
            res = requests.get(url, params=params, headers=headers, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            for item in data.get("data", []):
                # Ensure fatalities is parsed as int handles empty strings
                fatalities_str = item.get("fatalities", "0")
                try:
                    fatalities = int(fatalities_str)
                except ValueError:
                    fatalities = 0

                events.append({
                    "title": f"{item.get('event_type')} in {item.get('admin1', 'Unknown')}",
                    "summary": item.get("notes", ""),
                    "country": item.get("country"),
                    "source": "ACLED",
                    "date": item.get("event_date")
                })
        return json.dumps(events[:20])
    except Exception as e:
        print(f"Warning: ACLED API error: {str(e)}")
        return json.dumps([])
