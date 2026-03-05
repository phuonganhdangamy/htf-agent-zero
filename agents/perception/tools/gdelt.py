import requests
from urllib.parse import urlencode

# A simple wrapper for hitting the GDELT GKG JSON API
# In a real scenario you would parse CSV or use the GKG API properly
def query_gdelt_gkg(keywords: list, countries: list, max_records: int = 10):
    # This uses the GDELT DOC 2.0 API (which is JSON compatible)
    # query string format: (keyword1 OR keyword2) (country1 OR country2)
    kw_str = " OR ".join(f'"{k}"' for k in keywords)
    loc_str = " OR ".join(f'location:"{c}"' for c in countries)
    
    query = f"({kw_str}) ({loc_str})"
    
    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": max_records,
        "format": "json",
        "sortby": "DateDesc"
    }
    
    url = "https://api.gdeltproject.org/api/v2/doc/doc"
    try:
        req = requests.get(url, params=params, timeout=10)
        req.raise_for_status()
        data = req.json()
        return data.get("articles", [])
    except Exception as e:
        print(f"Error calling GDELT API: {e}")
        return []
