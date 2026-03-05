import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_acled_conflict_events(countries: list) -> str:
    """
    Fetches conflict and protest events from ACLED for specific countries.
    Requires ACLED_USERNAME (email) and ACLED_PASSWORD (key).
    """
    email = os.environ.get("ACLED_USERNAME")
    key = os.environ.get("ACLED_PASSWORD")
    if not email or not key:
        return json.dumps([{"error": "ACLED credentials missing. Provide ACLED_USERNAME and ACLED_PASSWORD in environment variables."}])
        
    url = "https://api.acleddata.com/acled/read"
    events = []
    
    try:
        for country in countries:
            params = {
                "key": key,
                "email": email,
                "country": country,
                "limit": 5,
                "format": "json"
            }
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            for item in data.get("data", []):
                events.append({
                    "title": f"{item.get('event_type')} in {item.get('admin1', 'Unknown')}",
                    "description": item.get("notes", ""),
                    "country": item.get("country"),
                    "source": "ACLED",
                    "severity": "High" if item.get("fatalities", 0) > 0 else "Medium",
                    "date": item.get("event_date")
                })
        return json.dumps(events[:20])
    except Exception as e:
        return json.dumps([{"error": f"ACLED API error: {str(e)}"}])
