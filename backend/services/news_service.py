"""
Real News Ingestion Service.

Fetches live supply chain and geopolitical news from NewsAPI.org
and converts articles into our signal_events format.

Falls back to Gemini-generated events if NEWS_API_KEY is not set.
Set NEWS_API_KEY in your .env to enable real news (100 req/day free tier).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

# Country → approximate centroid (lat, lon) for map placement
COUNTRY_COORDS: Dict[str, tuple] = {
    "taiwan": (23.5, 121.0),
    "china": (35.0, 105.0),
    "japan": (36.0, 138.0),
    "south korea": (36.5, 127.9),
    "germany": (51.2, 10.4),
    "united states": (37.1, -95.7),
    "usa": (37.1, -95.7),
    "mexico": (23.6, -102.6),
    "india": (20.6, 79.0),
    "vietnam": (14.1, 108.3),
    "malaysia": (4.2, 108.0),
    "thailand": (15.9, 100.9),
    "indonesia": (-0.8, 113.9),
    "ukraine": (48.4, 31.2),
    "russia": (61.5, 105.3),
    "israel": (31.0, 34.9),
    "taiwan, province of china": (23.5, 121.0),
}

# Keywords used to find supply-chain-relevant news
SUPPLY_CHAIN_QUERIES = [
    "supply chain disruption",
    "port strike shipping delay",
    "semiconductor shortage microchip",
    "tariff trade war manufacturing",
    "natural disaster factory flood",
    "geopolitical conflict manufacturing",
]


def _classify_event_type(title: str, description: str) -> str:
    text = f"{title} {description}".lower()
    if any(w in text for w in ["war", "conflict", "military", "strike", "protest", "sanction"]):
        return "Conflict"
    if any(w in text for w in ["flood", "earthquake", "typhoon", "hurricane", "storm", "wildfire", "disaster"]):
        return "Weather"
    if any(w in text for w in ["tariff", "trade", "customs", "import", "export", "duty", "ban"]):
        return "Trade"
    if any(w in text for w in ["shortage", "inflation", "recession", "bankruptcy", "insolvency", "crash"]):
        return "Economic"
    if any(w in text for w in ["port", "shipping", "logistics", "freight", "container", "congestion"]):
        return "Logistics"
    return "Economic"


def _classify_risk_category(event_type: str) -> str:
    return {
        "Conflict": "Geopolitical Conflict",
        "Weather": "Natural Disaster",
        "Trade": "Supply Chain Disruption",
        "Economic": "Economic Event",
        "Logistics": "Supply Chain Disruption",
    }.get(event_type, "Supply Chain Disruption")


def _extract_country_from_text(text: str) -> str:
    text_lower = text.lower()
    for country in COUNTRY_COORDS:
        if country in text_lower:
            return country.title()
    return "Global"


def _article_to_signal_event(article: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert a NewsAPI article to our signal_event format."""
    title = article.get("title") or ""
    description = article.get("description") or article.get("content") or ""
    source = (article.get("source") or {}).get("name") or "NewsAPI"
    url = article.get("url") or ""
    published = article.get("publishedAt") or datetime.now(timezone.utc).isoformat()

    if not title or title == "[Removed]":
        return None

    event_type = _classify_event_type(title, description)
    risk_category = _classify_risk_category(event_type)
    country = _extract_country_from_text(f"{title} {description}")
    coords = COUNTRY_COORDS.get(country.lower(), (None, None))

    # Build summary (cap at 300 chars)
    summary = description[:300] if description else title

    return {
        "event_id": f"EVT_{uuid.uuid4().hex[:8].upper()}",
        "event_type": event_type,
        "subtype": "News Article",
        "title": title[:80],
        "summary": summary,
        "country": country,
        "region": "",
        "lat": coords[0],
        "lon": coords[1],
        "confidence_score": 0.65,  # News = moderate-high confidence
        "tone": -0.7,  # Supply chain news is typically negative
        "risk_category": risk_category,
        "evidence_links": [url] if url else [],
        "signal_sources": [source],
        "forecasted": False,
    }


def fetch_news_signals(countries: List[str]) -> List[Dict[str, Any]]:
    """
    Fetch real supply chain news from NewsAPI.org.
    Returns list of signal events in our format.
    Falls back gracefully if API key is not configured.
    """
    api_key = os.environ.get("NEWS_API_KEY", "")
    if not api_key:
        return []

    try:
        import urllib.request
        import json as _json

        # Build country-focused query
        country_query = " OR ".join(countries[:4]) if countries else "supply chain"
        query = f"({country_query}) AND (supply chain OR manufacturing OR tariff OR disruption)"
        # NewsAPI free tier: articles from last 30 days
        from_date = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")

        url = (
            f"https://newsapi.org/v2/everything"
            f"?q={urllib.parse.quote(query)}"
            f"&from={from_date}"
            f"&language=en"
            f"&sortBy=relevancy"
            f"&pageSize=10"
            f"&apiKey={api_key}"
        )

        import urllib.parse
        url = (
            "https://newsapi.org/v2/everything"
            f"?q={urllib.parse.quote(query)}"
            f"&from={from_date}"
            f"&language=en"
            f"&sortBy=relevancy"
            f"&pageSize=10"
            f"&apiKey={api_key}"
        )

        req = urllib.request.Request(url, headers={"User-Agent": "OmniAgent/1.0"})
        with urllib.request.urlopen(req, timeout=8) as response:
            data = _json.loads(response.read().decode())

        articles = data.get("articles") or []
        events = []
        for article in articles:
            ev = _article_to_signal_event(article)
            if ev:
                events.append(ev)

        print(f"[news_service] Fetched {len(events)} signal events from NewsAPI")
        return events

    except Exception as e:
        print(f"[news_service] NewsAPI fetch failed: {e} — falling back to Gemini")
        return []


def get_news_api_status() -> Dict[str, Any]:
    """Check if NewsAPI is configured and return status."""
    api_key = os.environ.get("NEWS_API_KEY", "")
    if not api_key:
        return {
            "configured": False,
            "message": "NEWS_API_KEY not set — using Gemini-generated signals only. Add NEWS_API_KEY to .env for real news.",
        }
    return {
        "configured": True,
        "message": "NewsAPI is configured — real news will be ingested on each perception scan.",
    }
