import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_financial_news(keywords: list) -> str:
    """
    Fetches financial news and sentiment from Alpha Vantage based on keywords/tickers.
    Requires ALPHA_VANTAGE_API_KEY.
    """
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        return json.dumps([{"error": "ALPHA_VANTAGE_API_KEY missing in environment variables."}])
        
    url = "https://www.alphavantage.co/query"
    events = []
    
    try:
        # Alpha Vantage uses topics for NEWS_SENTIMENT
        topics_mapped = []
        for k in keywords:
            if "chip" in k.lower() or "semi" in k.lower() or "tech" in k.lower():
                topics_mapped.append("technology")
            elif "finance" in k.lower() or "bank" in k.lower():
                topics_mapped.append("finance")
            elif "manufacturing" in k.lower() or "factory" in k.lower():
                topics_mapped.append("manufacturing")
                
        topic_str = ",".join(set(topics_mapped)) if topics_mapped else "technology"
            
        params = {
            "function": "NEWS_SENTIMENT",
            "topics": topic_str,
            "apikey": api_key,
            "limit": 5
        }
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        for item in data.get("feed", [])[:10]:
            events.append({
                "title": item.get("title", ""),
                "description": item.get("summary", ""),
                "source": "Alpha Vantage",
                "severity": "Medium" if item.get("overall_sentiment_score", 0) < -0.15 else "Low",
                "link": item.get("url", "")
            })
            
        return json.dumps(events)
    except Exception as e:
        return json.dumps([{"error": f"Alpha Vantage API error: {str(e)}"}])
