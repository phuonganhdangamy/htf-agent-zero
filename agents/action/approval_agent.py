import json
import asyncio
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

@FunctionTool
def poll_for_approval(proposal_id: str, timeout_minutes: int = 5) -> str:
    """
    Polls the change_proposals table for approval by a human.
    In standard ADK we must block inside a tool or use specialized async events.
    For this demo, we simply poll synchronously or mock wait.
    """
    import time
    timeout_seconds = timeout_minutes * 60
    elapsed = 0
    poll_interval = 5
    
    while elapsed < timeout_seconds:
        try:
            res = supabase.table("change_proposals").select("status, approved_by").eq("proposal_id", proposal_id).execute()
            if res.data:
                proposal = res.data[0]
                status = proposal.get("status")
                if status in ["approved", "rejected"]:
                    return json.dumps({"status": status, "approved_by": proposal.get("approved_by")})
        except Exception as e:
            return json.dumps({"error": str(e)})
            
        time.sleep(poll_interval)
        elapsed += poll_interval
        
    return json.dumps({"status": "timeout"})

def build_approval_agent() -> LlmAgent:
    return LlmAgent(
        name="approval_agent",
        description="Waits for a Human-In-The-Loop (HITL) to approve the proposed change.",
        instruction="""You are the Approval Gate.
Your job is to:
1. Receive the proposal_id from previous steps.
2. Call `poll_for_approval` to wait for human authorization.
3. If approved, output an authorization token or 'Go' signal to the Commit Agent.
4. If rejected or timed out, gracefully abort execution and report failure.
""",
        model="gemini-2.5-flash",
        tools=[poll_for_approval]
    )
