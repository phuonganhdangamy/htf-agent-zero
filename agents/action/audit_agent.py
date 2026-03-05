import json
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def write_audit_log(case_id: str, action_run_id: str, actor: str, event_type: str, payload: str) -> str:
    """
    Writes an immutable audit log entry.
    """
    try:
        data = {
            "case_id": case_id,
            "action_run_id": action_run_id,
            "actor": actor,
            "event_type": event_type,
            "payload": json.loads(payload)
        }
        res = supabase.table("audit_log").insert(data).execute()
        return json.dumps({"status": "success", "audit_id": res.data[0].get("id") if res.data else None})
    except Exception as e:
        return json.dumps({"error": str(e)})

def build_audit_agent() -> LlmAgent:
    return LlmAgent(
        id="audit_agent",
        name="Audit Agent",
        description="Records all immutable state changes in the supply chain environment.",
        instructions="""You are the Audit Agent.
Your job is to:
1. Receive the outcome of the Verification Agent.
2. Call `write_audit_log` to permanently record the result of the action (e.g., event_type='commit_executed', payload={details}).
3. Output the final Audit Summary JSON.
""",
        model="gemini-2.5-flash",
        tools=[write_audit_log]
    )
