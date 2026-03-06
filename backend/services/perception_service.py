"""
Perception service — on-demand Gemini-powered disruption scan.
Fetches supplier countries from DB, calls Gemini to generate realistic signal events,
and saves new (deduplicated) events to signal_events table.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.services.supabase_client import supabase


def _get_gemini_client():
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not configured")
    from google import genai
    return genai.Client(api_key=api_key)


def _save_events_direct(events: List[Dict[str, Any]]) -> int:
    """Save a list of signal events to Supabase, skipping duplicates. Returns count saved."""
    saved = 0
    for ev in events:
        event_id = ev.get("event_id")
        if not event_id:
            continue
        # Deduplicate
        existing = supabase.table("signal_events").select("id").eq("event_id", event_id).execute()
        if existing.data:
            continue
        # Normalize tone
        tone = ev.get("tone")
        if isinstance(tone, str):
            t = tone.lower()
            ev["tone"] = -1.0 if "negative" in t else 1.0 if "positive" in t else 0.0
        # Strip fields not in schema
        for field in ["company_exposed", "severity_score", "risk_score"]:
            ev.pop(field, None)
        try:
            supabase.table("signal_events").insert(ev).execute()
            saved += 1
        except Exception as e:
            print(f"[perception] Failed to insert {event_id}: {e}")
    return saved


async def run_perception_scan(company_id: str = "ORG_DEMO") -> Dict[str, Any]:
    """
    Run a Gemini-powered perception scan for the company's supplier regions.
    Saves new signal events to DB.
    Returns scan summary + list of saved events for escalation.
    """
    # 1. Fetch supplier countries
    supp_res = supabase.table("suppliers").select("supplier_name, country").execute()
    suppliers = supp_res.data or []
    countries = list({s["country"] for s in suppliers if s.get("country")})
    if not countries:
        countries = ["Taiwan", "Japan", "Germany", "United States", "China"]

    # 2. Build prompt
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prompt = f"""You are a supply chain disruption intelligence analyst. Today is {today}.

The company monitors suppliers in these countries: {', '.join(countries)}.

Generate 4 to 6 realistic, current supply chain disruption signal events affecting those regions.
Each event should represent a different risk type (Conflict, Weather, Economic, Trade).
Make events realistic and plausible given today's geopolitical and economic environment.

Return ONLY a valid JSON array. Each element must have exactly these fields:
- event_id: string, format "EVT_" + 8 random alphanumeric chars (unique)
- event_type: one of "Conflict", "Weather", "Economic", "Trade", "Logistics"
- subtype: specific sub-category (e.g. "Protest", "Typhoon", "Tariff", "Port Strike")
- title: short descriptive title (max 80 chars)
- summary: 2-3 sentence description explaining the disruption and its supply chain impact
- country: affected country name
- region: specific region or city within country (can be empty string if national)
- lat: latitude as float (null if unknown)
- lon: longitude as float (null if unknown)
- confidence_score: float 0.0-1.0 reflecting how likely this disruption is real/imminent
- tone: float where -1.0=very negative, 0.0=neutral, 1.0=positive
- risk_category: one of "Supply Chain Disruption", "Geopolitical Conflict", "Natural Disaster", "Economic Event"
- evidence_links: empty array []
- signal_sources: array of source names like ["Reuters", "Bloomberg", "GDACS"]
- forecasted: boolean, true if predicted future event, false if current/recent

Return only the JSON array, no other text."""

    # 3. Call Gemini
    client = _get_gemini_client()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    raw = (response.text or "").strip()

    # 4. Parse JSON
    events: List[Dict[str, Any]] = []
    try:
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        events = json.loads(raw.strip())
        if not isinstance(events, list):
            events = []
    except Exception as e:
        print(f"[perception] JSON parse error: {e}\nRaw: {raw[:300]}")

    # Ensure each event has a unique event_id
    for ev in events:
        if not ev.get("event_id"):
            ev["event_id"] = f"EVT_{uuid.uuid4().hex[:8].upper()}"

    # 5. Save to DB
    saved_count = _save_events_direct(events)

    return {
        "scanned": True,
        "countries_monitored": countries,
        "events_generated": len(events),
        "new_events": saved_count,
        "new_signal_events": events[:saved_count],  # only the newly saved ones
    }
