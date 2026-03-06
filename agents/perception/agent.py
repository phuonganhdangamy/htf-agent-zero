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
        name="normalizer_agent",
        description="Reads incoming signals from external news/events tools and normalizes to Canonical Schema.",
        instruction="""You are the Normalizer Agent for an Autonomous Supply Chain Resilience system. You are the SOLE REASONING ENGINE.
The external tools only fetch raw data representations. You must do all the intelligent synthesis.
You must:
1. Call the external tools (GDACS, ACLED, Alpha Vantage, FRED, OpenWeather, WTO) using the target countries from context (e.g., Taiwan, Germany, Japan, South Korea).
2. Gather signals about disruptions.
3. Parse those alerts into a normalized list of SignalEvent objects matching the database schema.
IMPORTANT SCHEMA RULES:
- `event_id`: A unique string across the system.
- `title`: Actively synthesize a short, descriptive string title for the event if the provided title is too generic. NEVER leave null.
- `summary`: Synthesize a string paragraph explaining the event, inferring its severity, and extrapolating potential impacts. NEVER leave null.
- `event_type`: Classify the category (e.g., 'Conflict', 'Weather', 'Economic', 'Trade').
- `subtype`: Specify sub-classification (e.g., 'Protest', 'Hurricane', 'Tariff'). 
- `country`, `region`, `lat`, `lon`: Identify the exact location. NEVER leave null if you can reasonably infer or search for it.
- `confidence_score`: Estimate a float between 0.0 and 1.0 based on the source's data reliability.
- `tone`: Estimate a float where Negative=-1.0, Neutral=0.0, Positive=1.0.
- `risk_category`: Select from ('Supply Chain Disruption', 'Geopolitical Conflict', 'Natural Disaster', 'Economic Event').
- `evidence_links`: List of URLs as evidence if the source provides them.
- `signal_sources`: List of strings (e.g. ['ACLED', 'Reuters']).
- `forecasted`: Boolean true if this is a future prediction, false if current/past.

4. Call `save_signal_events` to store them in the database. You MUST NOT leave schema fields null if you can infer them. Ensure boolean fields are actually booleans, and lists are represented as lists.

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
        name="perception_pipeline",
        description="Pipeline to gather and normalize signals from the world.",
        sub_agents=[normalizer_agent]
    )
    return pipeline
