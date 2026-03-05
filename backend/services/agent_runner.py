import asyncio
from typing import Dict, Any
from backend.services.supabase_client import supabase

async def run_pipeline(company_id: str, trigger: str, context: dict = None):
    # This wraps AdkApp.async_stream_query()
    try:
        from agents.root_agent import run_omni_pipeline
        
        # Start the agent as a background task
        asyncio.create_task(run_omni_pipeline(company_id, trigger, context))
        return {"status": "started", "company_id": company_id}
    except Exception as e:
        print(f"Error starting agent pipeline: {e}")
        return {"status": "error", "message": str(e)}

async def poll_for_approval(proposal_id: str, timeout_hours: int = 2) -> Dict[str, Any]:
    # Poll change_proposals status every 5 seconds
    timeout_seconds = timeout_hours * 3600
    elapsed = 0
    while elapsed < timeout_seconds:
        response = supabase.table("change_proposals").select("status", "approved_by").eq("proposal_id", proposal_id).execute()
        if response.data:
            proposal = response.data[0]
            if proposal["status"] in ["approved", "rejected"]:
                return proposal
        
        await asyncio.sleep(5)
        elapsed += 5
        
    return {"status": "timeout"}
