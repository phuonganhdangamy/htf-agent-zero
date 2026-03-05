import sys
import os
import requests
from datetime import datetime
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
load_dotenv()

from backend.services.supabase_client import supabase
from agents.perception.tools.gdelt import query_gdelt_gkg

API_BASE_URL = "http://localhost:8000/api"
COMPANY_ID = os.environ.get("DEFAULT_COMPANY_ID", "ORG_DEMO")

def run():
    print(f"Starting GDELT ingestion job for {COMPANY_ID}...")
    
    # 1. Fetch supplier countries from ERP
    try:
        suppliers_res = supabase.table("suppliers").select("country").execute()
        countries = list(set([s["country"] for s in suppliers_res.data if s.get("country")]))
    except Exception as e:
        print(f"Failed to fetch suppliers: {e}")
        return

    if not countries:
        # Fallback to defaults
        countries = ["Taiwan", "Germany", "Japan", "South Korea"]
        
    print(f"Monitoring countries: {countries}")
    
    # 2. Risk keywords
    keywords = ["shortage", "disruption", "delay", "strike", "fire", "earthquake", "typhoon", "halt", "embargo"]
    
    # 3. Query GDELT
    articles = query_gdelt_gkg(keywords, countries, max_records=5)
    print(f"Found {len(articles)} articles from GDELT.")
    
    # 4. Normalize to DisruptionEvent and HTTP POST to ingestion endpoint
    for i, a in enumerate(articles):
        # We assume the article matches some criteria, so severity/confidence is heuristic
        event_payload = {
            "event_id": f"GDELT_{datetime.now().strftime('%Y%m%d%H%M%S')}_{i}",
            "event_type": "disruption",
            "country": a.get("domain", "Unknown"), # GDELT DOC API parsing is basic here
            "region": "Unknown",
            "lat": 0.0,
            "lon": 0.0,
            "start_date": datetime.now().isoformat(),
            "confidence_score": 0.7,
            "company_exposed": True,
            "evidence_links": [a.get("url")],
            "signal_sources": ["GDELT"],
            "risk_category": "supply_chain",
            "headline": a.get("title", "Unknown Event")
        }
        
        try:
            res = requests.post(f"{API_BASE_URL}/events/ingest", json=event_payload, timeout=5)
            if res.status_code == 200:
                print(f"Ingested: {event_payload['headline']}")
            else:
                print(f"Failed to ingest: {res.text}")
        except Exception as e:
            print(f"Error posting event: {e}")

if __name__ == "__main__":
    run()
