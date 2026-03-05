import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_wto_trade_restrictions(countries: list) -> str:
    """
    Fetches trade restrictions from the WTO API.
    Requires WTO_API_KEY.
    """
    api_key = os.environ.get("WTO_API_KEY")
    if not api_key:
        return json.dumps([{"error": "WTO_API_KEY missing in environment variables."}])
        
    url = "https://api.wto.org/timeseries/v1/data"
    events = []
    
    try:
        headers = {
            "Ocp-Apim-Subscription-Key": api_key
        }
        params = {
            "i": "HS_M_0010", # Example generic indicator
            "r": "all",
            "p": "all",
            "fmt": "json",
            "max": 5
        }
        
        res = requests.get(url, headers=headers, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        dataset = data.get("Dataset", [])
        for item in dataset:
            events.append({
                "title": "WTO Trade Data Update",
                "description": f"Trade index updated for category: {item.get('IndicatorCategory', 'Unknown')}",
                "source": "WTO",
                "severity": "Low"
            })
            
        return json.dumps(events)
    except Exception as e:
        return json.dumps([{"error": f"WTO API error: {str(e)}. Check your API key or endpoint access permissions."}])
