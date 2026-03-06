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
2. Draft a supplier-facing email explaining what is happening and what specific operational change is being requested.
3. DO NOT include internal-only mitigation labels (for example: do not literally write \"contact supplier\" or other internal step names in the email body).
4. DO NOT expose internal expected cost numbers, loss-prevention estimates, internal service-level targets, or other financial metrics that are meant only for internal stakeholders.
5. Keep the tone factual, neutral, and professional. The email should read as if a human supply planner wrote it, and MUST be safe for a human to further edit before sending.
6. Output the draft as JSON matching the DraftArtifact schema:
   - artifact_id
   - action_run_id
   - type='email'
   - preview: the full plain-text body that the human will edit
   - structured_payload: { to, subject, body }
   - status='pending'
7. Call `save_draft_artifact` to store the draft for later human review and editing.
""",
        model="gemini-2.5-flash",
        tools=[save_draft_artifact]
    )
