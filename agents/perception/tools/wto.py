import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_wto_trade_restrictions(countries: list[str]) -> str:
    """
    Fetches trade restrictions from the WTO API.
    Requires WTO_API_KEY.
    """
    api_key = os.environ.get("WTO_API_KEY")
    if not api_key:
        print("Warning: WTO_API_KEY missing.")
        return json.dumps([])
        
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
                "summary": f"Trade index updated for category: {item.get('IndicatorCategory', 'Unknown')}",
                "source": "WTO"
            })
            
        return json.dumps(events)
    except Exception as e:
        print(f"Warning: WTO API error: {str(e)}")
        return json.dumps([])
