import json
import requests

# GDELT DOC 2.0 API: full-text search over news. Use keyword query + optional sourcecountry.
# Doc: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
# No "location:" operator; use sourcecountry: for outlet country or plain keywords for topic.
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
    url = "https://api.gdeltproject.org/api/v2/doc/doc"
    try:
        req = requests.get(url, params=params, timeout=15)
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
