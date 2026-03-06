from dotenv import load_dotenv
import os
import json

# Ensure env vars are loaded
load_dotenv(".env")

from agents.perception.tools.gdacs import fetch_gdacs_alerts
from agents.perception.tools.acled import fetch_acled_conflict_events
from agents.perception.tools.alpha_vantage import fetch_financial_news
from agents.perception.tools.fred import fetch_macro_signals
from agents.perception.tools.open_weather import fetch_weather_alerts
from agents.perception.tools.wto import fetch_wto_trade_restrictions

def print_result(name, result):
    print(f"--- {name} ---")
    try:
        data = json.loads(result)
        if isinstance(data, list) and len(data) > 0 and "error" in data[0]:
            print("FAIL:", data[0]["error"])
        elif isinstance(data, dict) and "error" in data:
            print("FAIL:", data["error"])
        else:
            print(f"PASS: Returned {len(data) if isinstance(data, list) else 1} items.")
            print("Sample:", json.dumps(data[0] if isinstance(data, list) and data else data, indent=2))
    except Exception as e:
        print("FAIL (Parse Error):", str(e), "\nRaw:", result)
    print()

print("Running Connector Smoke Tests...\n")
print_result("GDACS", fetch_gdacs_alerts.func(["Taiwan"]))
print_result("ACLED", fetch_acled_conflict_events.func(["Taiwan"]))
print_result("Alpha Vantage", fetch_financial_news.func(["TSMC"]))
print_result("FRED", fetch_macro_signals.func(["interest"]))
print_result("OpenWeather", fetch_weather_alerts.func(["Taipei"]))
print_result("WTO", fetch_wto_trade_restrictions.func(["Taiwan"]))
