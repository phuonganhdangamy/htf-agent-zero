"""
Perception service — on-demand disruption scan from real APIs + LLM normalization.
1. Fetches raw data from: GDACS, ACLED, GDELT, WTO, OpenWeather (supplier locations),
   Alpha Vantage (manufacturer-relevant news), FRED (macro: interest, inflation, gdp).
2. Sends that raw data to Gemini to normalize into SignalEvent schema (no inventing events).
If no APIs are configured or all return empty, can optionally fall back to LLM-generated
demo events (see PERCEPTION_FALLBACK_TO_GENERATE).
"""
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.services.supabase_client import supabase
from backend.services.signal_event_utils import ensure_start_date

# Canonical country names for events feed (avoids "United States" vs "USA" vs "US" inconsistency)
_COUNTRY_CANONICAL = {
    "us": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "united kingdom": "United Kingdom",
    "great britain": "United Kingdom",
    "south korea": "South Korea",
    "korea": "South Korea",
    "republic of korea": "South Korea",
    "taiwan": "Taiwan",
    "malaysia": "Malaysia",
    "japan": "Japan",
    "china": "China",
    "germany": "Germany",
    "france": "France",
    "netherlands": "Netherlands",
    "india": "India",
    "mexico": "Mexico",
    "canada": "Canada",
}


def _canonical_country(name: Optional[str]) -> str:
    """Normalize country name to a single canonical form for display/filtering."""
    if not name or not isinstance(name, str):
        return name or ""
    key = name.strip().lower()
    return _COUNTRY_CANONICAL.get(key, name.strip())


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
        # Normalize country to canonical name (e.g. USA/US -> United States)
        if ev.get("country"):
            ev["country"] = _canonical_country(ev["country"])
        ensure_start_date(ev)
        try:
            supabase.table("signal_events").insert(ev).execute()
            saved += 1
        except Exception as e:
            print(f"[perception] Failed to insert {event_id}: {e}")
    return saved


# Fallback city per country for weather when no supplier region (e.g. Taiwan -> Taipei)
_COUNTRY_CITY_FALLBACK = {
    "Taiwan": "Taipei",
    "Malaysia": "Kuala Lumpur",
    "Japan": "Tokyo",
    "South Korea": "Seoul",
    "Germany": "Berlin",
    "United States": "New York",
    "China": "Shanghai",
}

# Default keywords for Alpha Vantage when DB has no materials/products
_DEFAULT_NEWS_KEYWORDS = ["semiconductor", "chip", "manufacturing", "electronics", "supply chain"]


def _get_news_keywords_from_db() -> List[str]:
    """Build manufacturer-relevant keywords from company_profiles and materials for Alpha Vantage news."""
    keywords = set()
    try:
        prof = supabase.table("company_profiles").select("industry, primary_products").limit(1).execute()
        if prof.data:
            row = prof.data[0]
            if row.get("industry"):
                keywords.add("manufacturing")
                industry_lower = str(row["industry"]).lower()
                if "electron" in industry_lower or "semi" in industry_lower:
                    keywords.update(["electronics", "semiconductor", "chip"])
            if row.get("primary_products"):
                products = row["primary_products"]
                if isinstance(products, list):
                    for p in products:
                        if p and isinstance(p, str):
                            keywords.add(p.lower().replace(" ", "_")[:30])
                elif isinstance(products, str):
                    keywords.add(products.lower()[:30])
        mat = supabase.table("materials").select("material_name").limit(20).execute()
        if mat.data:
            for row in mat.data:
                name = (row.get("material_name") or "").lower()
                if not name:
                    continue
                if "wafer" in name or "chip" in name or "semi" in name:
                    keywords.update(["semiconductor", "chip", "wafer"])
                if "commodity" in name or "raw" in name:
                    keywords.add("commodity")
    except Exception as e:
        print(f"[perception] keywords from DB failed: {e}")
    out = list(keywords) if keywords else _DEFAULT_NEWS_KEYWORDS
    return out[:15]


def _fetch_raw_from_apis(
    countries: List[str],
    regions: Optional[List[str]] = None,
    news_keywords: Optional[List[str]] = None,
) -> str:
    """
    Call real event/news/weather/macro APIs. Returns a single text blob for the LLM to normalize.
    - GDACS, ACLED, GDELT, WTO: by supplier countries.
    - OpenWeather: supplier regions + one city per country.
    - Alpha Vantage: manufacturer-relevant keywords (semiconductor, chip, manufacturing, etc.).
    - FRED: macro indicators (interest, inflation, gdp) for economic-risk signals.
    """
    parts = []
    # Disaster / conflict / news / trade
    try:
        from agents.perception.tools.gdacs import fetch_gdacs_alerts
        raw = fetch_gdacs_alerts.func(countries)
        if raw and raw != "[]":
            parts.append(f"=== GDACS (disasters / hazards) ===\n{raw}")
    except Exception as e:
        print(f"[perception] GDACS fetch failed: {e}")

    try:
        from agents.perception.tools.acled import fetch_acled_conflict_events
        raw = fetch_acled_conflict_events.func(countries)
        if raw and raw != "[]":
            parts.append(f"=== ACLED (conflict / protests) ===\n{raw}")
    except Exception as e:
        print(f"[perception] ACLED fetch failed: {e}")

    try:
        from agents.perception.tools.gdelt import query_gdelt_gkg
        keywords = ["shortage", "disruption", "delay", "strike", "port", "typhoon", "embargo", "supply chain"]
        articles = query_gdelt_gkg(keywords, countries, max_records=8)
        if articles:
            parts.append(f"=== GDELT (news) ===\n{json.dumps(articles, default=str)}")
    except Exception as e:
        print(f"[perception] GDELT fetch failed: {e}")

    try:
        from agents.perception.tools.wto import fetch_wto_trade_restrictions
        raw = fetch_wto_trade_restrictions.func(countries)
        if raw and raw not in ("[]", "{}", ""):
            parts.append(f"=== WTO (trade) ===\n{raw}")
    except Exception as e:
        print(f"[perception] WTO fetch failed: {e}")

    # Weather at supplier regions / key cities (disruption-relevant: storms, extreme conditions)
    try:
        from agents.perception.tools.open_weather import fetch_weather_alerts
        locations = list(regions) if regions else []
        for c in countries:
            city = _COUNTRY_CITY_FALLBACK.get(c)
            if city and city not in locations:
                locations.append(city)
        if locations:
            raw = fetch_weather_alerts.func(locations[:8])
            if raw and raw != "[]":
                parts.append(f"=== OpenWeather (weather at supplier locations) ===\n{raw}")
    except Exception as e:
        print(f"[perception] OpenWeather fetch failed: {e}")

    # Alpha Vantage: news relevant to manufacturer (semiconductor, electronics, commodities, supply chain)
    try:
        from agents.perception.tools.alpha_vantage import fetch_financial_news
        keywords = list(news_keywords) if news_keywords else ["semiconductor", "chip", "manufacturing", "electronics", "supply chain"]
        raw = fetch_financial_news.func(keywords[:10])
        if raw and raw != "[]":
            parts.append(f"=== Alpha Vantage (news / sentiment) ===\n{raw}")
    except Exception as e:
        print(f"[perception] Alpha Vantage fetch failed: {e}")

    # FRED: macro signals (interest, inflation, gdp) that affect demand and supply chain cost
    try:
        from agents.perception.tools.fred import fetch_macro_signals
        raw = fetch_macro_signals.func(["interest", "inflation", "gdp"])
        if raw and raw != "[]":
            parts.append(f"=== FRED (macro indicators) ===\n{raw}")
    except Exception as e:
        print(f"[perception] FRED fetch failed: {e}")

    if not parts:
        return ""
    return "\n\n".join(parts)


async def run_perception_scan(
    company_id: str = "ORG_DEMO",
    focus_countries: Optional[List[str]] = None,
    focus_regions: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run a Gemini-powered perception scan. When the manager interprets the user's
    scenario (e.g. "new contract in Mexico"), it can pass focus_countries so we
    fetch signals for those regions instead of only DB supplier countries.
    """
    # 1. Build country list from DB suppliers (data-driven: Taiwan, Malaysia, Japan, etc.)
    supp_res = supabase.table("suppliers").select("supplier_name, country, region").execute()
    suppliers = supp_res.data or []
    supplier_countries = list({s["country"] for s in suppliers if s.get("country")})
    supplier_regions = list({s["region"] for s in suppliers if s.get("region") and str(s["region"]).strip()})
    fallback = ["Taiwan", "Japan", "Germany", "United States", "China"]
    if focus_countries:
        # User scenario drove focus (e.g. Mexico); merge with supplier countries for breadth
        countries = list(dict.fromkeys([c.strip() for c in focus_countries if c and c.strip()]))
        for c in supplier_countries:
            if c and c not in countries:
                countries.append(c)
        if not countries:
            countries = fallback
    else:
        countries = supplier_countries or fallback

    # 2. Regions for context (cities like Kaohsiung, Taichung, Penang)
    region_parts = list(supplier_regions)
    if focus_regions:
        for r in focus_regions:
            if r and str(r).strip() and r not in region_parts:
                region_parts.append(r)

    # 2b. Manufacturer-relevant keywords for Alpha Vantage (from materials / products / industry)
    news_keywords = _get_news_keywords_from_db()

    # 3. Fetch from real APIs: GDACS, ACLED, GDELT, WTO, OpenWeather, Alpha Vantage, FRED
    raw_feed = _fetch_raw_from_apis(countries, region_parts, news_keywords=news_keywords)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if raw_feed:
        # Primary path: normalize API data into SignalEvent schema. Do NOT invent events.
        prompt = f"""You are a supply chain disruption intelligence analyst. Today is {today}.

Below is RAW data from real APIs: GDACS (disasters), ACLED (conflict), GDELT (news), WTO (trade), OpenWeather (weather at supplier locations), Alpha Vantage (news/sentiment for the manufacturer's sector), FRED (macro indicators: interest, inflation, GDP). Your job is to NORMALIZE it into a JSON array of SignalEvent objects.

RULES:
- Include ONLY events that actually appear in the raw data below. Do NOT invent or generate events.
- For each relevant disruption or risk signal in the raw data, output one object. Weather extremes (storms, floods), macro shocks (rate moves, inflation), and sector news that could affect supply/demand all count. If the raw data has no relevant supply-chain disruptions, return [].
- Preserve the source of each event (e.g. GDACS, ACLED, OpenWeather, Alpha Vantage, FRED) in signal_sources. Use evidence_links from the raw data when URLs are provided.

Schema for each object (all required):
- event_id: string, "EVT_" + 8 random alphanumeric chars (unique per event)
- event_type: one of "Conflict", "Weather", "Economic", "Trade", "Logistics"
- subtype: e.g. "Protest", "Typhoon", "Tariff", "Port Strike"
- title: short descriptive title (max 80 chars), from or inferred from raw data
- summary: 2-3 sentences explaining the disruption and supply chain impact
- country: affected country name (from raw data)
- region: specific region/city if present, else ""
- lat: float or null, lon: float or null
- confidence_score: 0.0-1.0 (infer from source reliability)
- tone: -1.0 to 1.0 (negative to positive)
- risk_category: "Supply Chain Disruption", "Geopolitical Conflict", "Natural Disaster", or "Economic Event"
- evidence_links: array of URLs from raw data, or []
- signal_sources: e.g. ["GDACS"], ["ACLED"], ["GDELT"]
- forecasted: boolean
- start_date: ISO date string (from raw data or today)

Return ONLY a valid JSON array, no other text.

RAW DATA FROM APIs:
---
{raw_feed}
---"""

        client = _get_gemini_client()
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        raw = (response.text or "").strip()
    else:
        # No API data: fall back to LLM-generated events only if explicitly enabled (e.g. demo without API keys)
        fallback = os.environ.get("PERCEPTION_FALLBACK_TO_GENERATE", "").lower() in ("1", "true", "yes")
        if not fallback:
            raw = "[]"
        else:
            region_note = f" Pay special attention to: {', '.join(region_parts)}." if region_parts else ""
            prompt = f"""You are a supply chain disruption intelligence analyst. Today is {today}.
The company monitors: {', '.join(countries)}.{region_note}
Generate 2 to 4 realistic, current supply chain disruption signal events affecting those regions. Use only event types Conflict, Weather, Economic, Trade, Logistics.
Return ONLY a valid JSON array. Each element: event_id ("EVT_" + 8 alphanumeric), event_type, subtype, title, summary, country, region, lat (float or null), lon (float or null), confidence_score (0-1), tone (-1 to 1), risk_category, evidence_links [], signal_sources [], forecasted (bool), start_date (ISO). No other text."""
            client = _get_gemini_client()
            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            raw = (response.text or "").strip()

    # 4. Parse JSON (sanitize: LLM sometimes emits literal newlines/control chars inside strings, which is invalid JSON)
    events: List[Dict[str, Any]] = []
    try:
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        # Replace ASCII control characters (e.g. literal newline in "summary") with space so json.loads succeeds
        raw = "".join(c if ord(c) >= 32 else " " for c in raw)
        events = json.loads(raw)
        if not isinstance(events, list):
            events = []
    except Exception as e:
        print(f"[perception] JSON parse error: {e}\nRaw: {raw[:300]}")

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
        "new_signal_events": events[:saved_count],
        "from_real_apis": bool(raw_feed),  # True when events were normalized from GDACS/ACLED/GDELT/WTO
    }
