"""
Approval Agent — converted from LLM agent to deterministic tool.

Polls for human approval on a change proposal. This is a pure polling
operation (no LLM reasoning needed): check the proposal status in DB
and return the result.
"""
import json
import time
from typing import Dict, Any, Optional
from backend.services.supabase_client import supabase


def check_approval_status(proposal_id: str) -> Dict[str, Any]:
    """
    Deterministic function: checks current approval status of a proposal.
    No LLM needed — just a database lookup.

    Returns:
        Dict with status ('pending', 'approved', 'rejected') and approved_by
    """
    try:
        res = supabase.table("change_proposals").select(
            "status, approved_by, approved_at"
        ).eq("proposal_id", proposal_id).execute()
        if res.data:
            proposal = res.data[0]
            return {
                "status": proposal.get("status", "pending"),
                "approved_by": proposal.get("approved_by"),
                "approved_at": proposal.get("approved_at"),
            }
        return {"status": "not_found"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def poll_for_approval_sync(
    proposal_id: str,
    timeout_minutes: int = 5,
    poll_interval: int = 5,
) -> Dict[str, Any]:
    """
    Synchronous polling for approval. Blocks until approval/rejection or timeout.
    No LLM needed.
    """
    timeout_seconds = timeout_minutes * 60
    elapsed = 0

    while elapsed < timeout_seconds:
        result = check_approval_status(proposal_id)
        status = result.get("status")
        if status in ("approved", "rejected"):
            return result
        if status == "error":
            return result
        time.sleep(poll_interval)
        elapsed += poll_interval

    return {"status": "timeout"}


# ---- Backwards-compatible LLM agent builder (kept for ADK pipeline use) ----
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

@FunctionTool
def poll_for_approval(proposal_id: str, timeout_minutes: int = 5) -> str:
    """Polls the change_proposals table for approval by a human."""
    result = poll_for_approval_sync(proposal_id, timeout_minutes)
    return json.dumps(result)

def build_approval_agent() -> LlmAgent:
    """Legacy LLM agent builder — kept for backwards compatibility."""
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
