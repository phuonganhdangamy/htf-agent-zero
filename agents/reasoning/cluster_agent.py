import requests
from google.adk.agents import LlmAgent

def build_cluster_agent() -> LlmAgent:
    return LlmAgent(
        name="cluster_agent",
        description="Fuses incoming signal events and deduplicates them into distinct event clusters based on geography, keywords, and time.",
        instruction="""You are the Cluster Agent. Your job is to:
1. Review the list of recent Disruption Events passed in the context.
2. Group related events that likely refer to the same physical disruption. For example, a typhoon in Taiwan and port delays in Kaohsiung should be grouped together.
3. Output the EventClusters (cluster_id, event_ids, cluster_summary, cluster_geo, cluster_confidence) as JSON.
""",
        model="gemini-2.5-flash"
    )
