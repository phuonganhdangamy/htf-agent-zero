import os
import json
import requests
from difflib import get_close_matches
from google.adk.tools import FunctionTool

# Module-level cache so we only fetch the reporters list once per process
_WTO_REPORTERS_CACHE: dict[str, str] = {}  # {lowercase_name: code}

def _load_reporters_cache(api_key: str) -> None:
    """Fetches the full WTO reporters list and populates the cache."""
    global _WTO_REPORTERS_CACHE
    if _WTO_REPORTERS_CACHE:
        return
    try:
        url = "https://api.wto.org/timeseries/v1/reporters"
        headers = {"Ocp-Apim-Subscription-Key": api_key}
        res = requests.get(url, headers=headers, params={"lang": "1"}, timeout=10)
        res.raise_for_status()
        for item in res.json():
            name = (item.get("name") or "").lower().strip()
            code = str(item.get("code", ""))
            if name and code:
                _WTO_REPORTERS_CACHE[name] = code
    except Exception as e:
        print(f"Warning: Could not fetch WTO reporters list: {e}")


def _get_reporter_code(country_name: str, api_key: str) -> str | None:
    """
    Resolves a free-text country name to a WTO numeric reporter code.
    Uses the WTO /reporters API + fuzzy matching — no hardcoded tables.
    """
    _load_reporters_cache(api_key)
    if not _WTO_REPORTERS_CACHE:
        return None

    query = country_name.lower().strip()
    known_names = list(_WTO_REPORTERS_CACHE.keys())

    # 1. Exact match
    if query in _WTO_REPORTERS_CACHE:
        return _WTO_REPORTERS_CACHE[query]

    # 2. Fuzzy match (handles "Taiwan" → "Chinese Taipei", "Korea" → "Korea, Republic of", etc.)
    matches = get_close_matches(query, known_names, n=1, cutoff=0.5)
    if matches:
        return _WTO_REPORTERS_CACHE[matches[0]]

    # 3. Substring match as final fallback
    for name, code in _WTO_REPORTERS_CACHE.items():
        if query in name or name in query:
            return code

    return None


@FunctionTool
def fetch_wto_trade_restrictions(countries: list[str]) -> str:
    """
    Fetches merchandise trade data from the WTO API for specific countries.
    Country names are resolved dynamically via the WTO /reporters API with fuzzy matching.
    Uses WTO indicator ITS_MTV_AM (Merchandise trade values - annual).
    Requires WTO_API_KEY.
    """
    api_key = os.environ.get("WTO_API_KEY")
    if not api_key:
        print("Warning: WTO_API_KEY missing.")
        return json.dumps([])

    url = "https://api.wto.org/timeseries/v1/data"
    headers = {"Ocp-Apim-Subscription-Key": api_key}
    events = []

    try:
        for country_name in countries:
            reporter = _get_reporter_code(country_name, api_key)
            if not reporter:
                print(f"Warning: Could not resolve WTO reporter code for '{country_name}', skipping.")
                continue

            params = {
                "i": "ITS_MTV_AM",
                "r": reporter,
                "fmt": "json",
                "max": 3,
                "lang": "1",
            }
            res = requests.get(url, headers=headers, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()

            dataset = data.get("Dataset", [])
            for item in dataset:
                events.append({
                    "title": f"WTO Merchandise Trade Update: {country_name}",
                    "description": (
                        f"Trade value for {country_name}: {item.get('Value', 'N/A')} "
                        f"({item.get('PeriodId', 'unknown period')})"
                    ),
                    "source": "WTO",
                    "severity": "Low",
                    "country": country_name,
                    "link": "https://stats.wto.org/",
                })

        return json.dumps(events)
    except Exception as e:
        print(f"Warning: WTO API error: {str(e)}")
        return json.dumps([])
