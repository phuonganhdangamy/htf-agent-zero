import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_macro_signals(indicators: list[str]) -> str:
    """
    Fetches macroeconomic signals (like interest rates or inflation) from FRED.
    Requires FRED_API_KEY.
    """
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("Warning: FRED_API_KEY missing.")
        return json.dumps([])
        
    url = "https://api.stlouisfed.org/fred/series/observations"
    events = []
    
    # Map common indicators to FRED series IDs
    series_map = {
        "interest": "FEDFUNDS",
        "inflation": "CPIAUCSL",
        "unemployment": "UNRATE",
        "gdp": "GDP"
    }
    
    try:
        found_indicators = []
        for ind in indicators:
            for k, v in series_map.items():
                if k in ind.lower() and v not in found_indicators:
                    found_indicators.append(v)
                    
        if not found_indicators:
            found_indicators = ["FEDFUNDS"] # default
            
        for series_id in found_indicators:
            params = {
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "limit": 1,
                "sort_order": "desc"
            }
            
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            observations = data.get("observations", [])
            if observations:
                latest = observations[0]
                ev = {
                    "title": f"Latest FRED {series_id} Data: {latest.get('value')}",
                    "summary": f"Macroeconomic indicator {series_id} is at {latest.get('value')} on {latest.get('date')}",
                    "source": "FRED"
                }
                if latest.get("date"):
                    ev["date"] = latest.get("date")
                events.append(ev)
        return json.dumps(events)
    except Exception as e:
        print(f"Warning: FRED API error: {str(e)}")
        return json.dumps([])
