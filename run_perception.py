import os
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from agents.perception.agent import build_perception_pipeline
from google.adk.apps.app import App
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
import uuid

def main():
    interval_minutes = int(os.environ.get("PERCEPTION_POLL_INTERVAL", "30"))
    interval_seconds = interval_minutes * 60

    print(f"Starting standalone perception runner.")
    print(f"Polling interval set to {interval_minutes} minutes.")

    # Initialize pipeline
    pipeline = build_perception_pipeline()

    # Define the execution prompt
    prompt = (
        "Fetch signals for the following key countries: Canada, Taiwan, Germany, Japan, USA, South Korea, and China. "
        "Run all available tools: fetch_gdacs_alerts, fetch_acled_conflict_events, fetch_financial_news, "
        "fetch_macro_signals, fetch_weather_alerts, and fetch_wto_trade_restrictions. "
        "Normalize the gathered data into SignalEvent objects and save them to the database.\n\n"
        "CRITICAL INSTRUCTION: You MUST aggressively parse all text to fill in EVERY field of the SignalEvent schema. "
        "Never leave `title`, `summary`, `tone`, `country`, `lat`, `lon`, or `confidence_score` blank if you can infer them from the data. "
        "Translate string sentiments to numeric tones (e.g. Negative = -1.0, Positive = 1.0, Neutral = 0.0)."
    )

    # Create ADK App and Runner
    app = App(name="perception_app", root_agent=pipeline)
    runner = Runner(app=app, session_service=InMemorySessionService(), auto_create_session=True)

    try:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Executing Perception Pipeline...")
        session_id = f"perception_run_{int(time.time())}_{str(uuid.uuid4())[:8]}"
        events = runner.run(
            user_id="system",
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)])
        )
        
        for event in events:
            # We can print all events to see if tools are being used
            print(f"Event author: {event.author}")
            if event.content and event.content.parts:
                text_parts = [p.text for p in event.content.parts if p.text]
                if text_parts:
                    print(f"Content: {' '.join(text_parts)}")
            if event.get_function_calls():
                for call in event.get_function_calls():
                    print(f"Tool Call: {call.name}")
            if event.get_function_responses():
                for resp in event.get_function_responses():
                    print(f"Tool Response for {resp.name}")
                    try:
                        import json
                        # Attempt to pretty-print the JSON response
                        if isinstance(resp.response, dict):
                            print(json.dumps(resp.response, indent=2))
                        elif isinstance(resp.response, str):
                            print(json.dumps(json.loads(resp.response), indent=2))
                        else:
                            print(resp.response)
                    except Exception:
                        print(f"Content: {resp.response}")

        print("Pipeline executed.")
    except Exception as e:
        print(f"Error during perception pipeline execution: {e}")

if __name__ == "__main__":
    main()
