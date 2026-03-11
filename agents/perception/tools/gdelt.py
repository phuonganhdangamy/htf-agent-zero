import json
import time
import requests

# GDELT DOC 2.0 API: full-text search over news. Rate-limited (429); we throttle and skip on 429.
# Doc: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
_last_gdelt_call = 0.0
_GDELT_MIN_INTERVAL_SEC = 120  # Don't call more than once per 2 minutes to avoid 429


def query_gdelt_gkg(keywords: list, countries: list, max_records: int = 10):
    # Query: (keyword1 OR keyword2) and optionally restrict by source country
    kw_str = " OR ".join(f'"{k}"' for k in keywords[:8] if k)
    if not kw_str:
        kw_str = '"supply chain" OR disruption'
    # Optional: sourcecountry: limits to outlets in that country (no spaces: "southkorea")
    source_countries = [c.replace(" ", "").lower() for c in countries[:5] if c]
    if source_countries:
        sc_str = " OR ".join(f"sourcecountry:{c}" for c in source_countries)
        query = f"({kw_str}) ({sc_str})"
    else:
        query = kw_str

    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": min(max_records, 75),
        "format": "json",
        "sort": "datedesc",
        "timespan": "1week",
    }
    global _last_gdelt_call
    now = time.time()
    if now - _last_gdelt_call < _GDELT_MIN_INTERVAL_SEC:
        return []  # Throttle: skip to avoid 429
    _last_gdelt_call = now

    url = "https://api.gdeltproject.org/api/v2/doc/doc"
    try:
        req = requests.get(url, params=params, timeout=15)
        if req.status_code == 429:
            print("GDELT API: 429 Too Many Requests (throttled); skipping this run.")
            return []
        req.raise_for_status()
        text = (req.text or "").strip()
        if not text:
            return []
        # API can return HTML or empty for bad query / no results; avoid JSON decode on non-JSON
        if text.startswith("<") or not (text.startswith("{") or text.startswith("[")):
            return []
        data = json.loads(text)
        # ArtList JSON can be {"articles": [...]} or a different structure
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("articles", data.get("article", []))
        return []
    except json.JSONDecodeError as e:
        print(f"Error calling GDELT API: response was not JSON ({e})")
        return []
    except Exception as e:
        print(f"Error calling GDELT API: {e}")
        return []
