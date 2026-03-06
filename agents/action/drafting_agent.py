import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase
from backend.services.action_steps import update_step

@FunctionTool
def save_draft_artifact(artifact_json: str) -> str:
    """Saves a draft message (email, Slack notification, Jira ticket) to the database."""
    try:
        data = json.loads(artifact_json)
        res = supabase.table("draft_artifacts").insert(data).execute()
        artifact_id = res.data[0].get("artifact_id") if res.data else None
        action_run_id = data.get("action_run_id")
        # Attach the draft to Step 2 (DraftingAgent) in action_runs.steps
        if action_run_id and artifact_id:
            update_step(action_run_id, 1, "DONE", artifact_id=artifact_id)
        return json.dumps({"status": "success", "artifact_id": artifact_id})
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_drafting_agent() -> LlmAgent:
    return LlmAgent(
        name="drafting_agent",
        description="Drafts human-readable messages (emails, tickets) for stakeholders about the proposed change.",
        instruction="""You are the Drafting Agent.
Your job is to:
1. Receive the Execution Plan and the Change Proposal.
2. Draft an email or alert explaining what is happening, what action is proposed, and why it is necessary.
3. Output the draft as a JSON matching the DraftArtifact schema (artifact_id, action_run_id, type='email', preview (the text), structured_payload, status='pending').
4. Call `save_draft_artifact` to store the draft.
""",
        model="gemini-2.5-flash",
        tools=[save_draft_artifact]
    )
