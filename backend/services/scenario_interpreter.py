"""
Manager uses this to interpret the user's scenario and decide what the perception
layer should fetch (e.g. which countries/regions). So "new contract in Mexico"
drives perception to look at Mexico instead of only DB supplier countries.
"""
import json
import os
from typing import Any, Dict, List

def _get_gemini_client():
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not configured")
    from google import genai
    return genai.Client(api_key=api_key)


def interpret_scenario_for_perception(scenario_text: str) -> Dict[str, Any]:
    """
    Parse the user's scenario to extract geographic and topic focus for the perception layer.
    Returns focus_countries, focus_regions, and focus_topics so perception can fetch relevant signals.
    """
    if not (scenario_text or "").strip():
        return {"focus_countries": [], "focus_regions": [], "focus_topics": []}

    prompt = f"""You are a supply chain analyst. The user described this scenario:

"{scenario_text.strip()}"

From this scenario, extract what the PERCEPTION layer should monitor to find relevant disruption signals:
1. focus_countries: list of country names explicitly or implicitly mentioned (e.g. Mexico, USA, Taiwan). Use standard English names.
2. focus_regions: list of regions, cities, or areas if mentioned (e.g. "Gulf of Mexico", "Baja California").
3. focus_topics: short list of risk/topic keywords for signal relevance (e.g. "new supplier", "contract", "trade", "logistics").

Return ONLY a JSON object with exactly these keys. No other text.
Example: {{ "focus_countries": ["Mexico"], "focus_regions": [], "focus_topics": ["new contract", "supplier qualification"] }}
If no geography is mentioned, return empty arrays for focus_countries and focus_regions."""

    try:
        client = _get_gemini_client()
        from google.genai import types
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        raw = (response.text or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.lower().startswith("json"):
                raw = raw[4:]
        out = json.loads(raw.strip())
        return {
            "focus_countries": list(out.get("focus_countries") or [])[:20],
            "focus_regions": list(out.get("focus_regions") or [])[:20],
            "focus_topics": list(out.get("focus_topics") or [])[:10],
        }
    except Exception as e:
        print(f"[scenario_interpreter] {e}")
        return {"focus_countries": [], "focus_regions": [], "focus_topics": []}
