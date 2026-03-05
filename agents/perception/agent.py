from google.adk.agents import LlmAgent, SequentialAgent
from agents.perception.tools.gdacs import fetch_gdacs_alerts
from agents.perception.tools.acled import fetch_acled_conflict_events
from agents.perception.tools.alpha_vantage import fetch_financial_news
from agents.perception.tools.fred import fetch_macro_signals
from agents.perception.tools.open_weather import fetch_weather_alerts
from agents.perception.tools.wto import fetch_wto_trade_restrictions
from agents.perception.tools.normalizer import save_signal_events

def build_perception_pipeline() -> SequentialAgent:
    normalizer_agent = LlmAgent(
        id="normalizer_agent",
        name="Normalizer Agent",
        description="Reads incoming signals from external news/events tools and normalizes to Canonical Schema.",
        instructions="""You are the Normalizer Agent for an Autonomous Supply Chain Resilience system. 
You must:
1. Call the external tools (GDACS, ACLED, Alpha Vantage, FRED, OpenWeather, WTO) using the target countries from context (e.g., Taiwan, Germany, Japan, South Korea).
2. Gather signals about disruptions.
3. Parse those alerts into a normalized list of SignalEvent objects matching the database schema (event_id, event_type, subtype, country, region, confidence_score, company_exposed, evidence_links, signal_sources, tone, risk_category, forecasted).
4. Call `save_signal_events` to store them in the database. Ensure boolean fields are actually booleans, and lists are represented as lists.

Always write the events using your tools. Finally, return a short summary of how many events you processed.
""",
        model="gemini-2.5-flash",
        tools=[
            fetch_gdacs_alerts,
            fetch_acled_conflict_events,
            fetch_financial_news,
            fetch_macro_signals,
            fetch_weather_alerts,
            fetch_wto_trade_restrictions,
            save_signal_events
        ]
    )
    
    pipeline = SequentialAgent(
        id="perception_pipeline",
        name="Perception Pipeline",
        description="Pipeline to gather and normalize signals from the world.",
        agents=[normalizer_agent]
    )
    return pipeline
