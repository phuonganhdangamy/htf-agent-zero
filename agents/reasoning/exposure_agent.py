from google.adk.agents import LlmAgent

def build_exposure_agent() -> LlmAgent:
    return LlmAgent(
        id="exposure_agent",
        name="Exposure Agent",
        description="Maps event clusters to business exposure (suppliers, routes, facilities, inventory).",
        instructions="""You are the Exposure Agent in an autonomous supply chain system.
Your job is to:
1. Take the EventClusters and the Supply Chain Snapshot (suppliers, facilities, inventory, BOM) passed in context.
2. Identify which assets (suppliers, routes, facilities) are geographically or contractually exposed to the clusters.
3. Calculate an exposure_score (0.0 to 1.0) based on criticality, single-source status, and inventory buffer buffer days remaining.
4. Output ExposureReports per cluster as JSON containing: affected_assets, exposure_score, rationale.
""",
        model="gemini-2.5-flash"
    )
