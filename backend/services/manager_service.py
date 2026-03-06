"""
Manager Service - Wraps agent execution with manager orchestration logic.
For v1, manager orchestrates existing flows without replacing them.
"""
import json
import time
from typing import Dict, Any, Optional
from backend.services.supabase_client import supabase
from agents.manager.omni_manager import create_manager_decision
from agents.manager.session_tracker import get_or_create_session, update_session


async def run_with_manager(
    company_id: str,
    trigger_type: str,
    payload: Dict[str, Any],
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Runs agent execution through the manager layer.
    
    Args:
        company_id: Organization ID
        trigger_type: "user_scenario" | "scheduled" | "alert" | "post_action"
        payload: Context and parameters for the execution
        session_id: Optional session ID (creates new if not provided)
    
    Returns:
        Result dict with status and case_id if applicable
    """
    # Get or create session
    session = get_or_create_session(company_id, session_id)
    session_id = session["session_id"]
    
    # Create manager decision
    decision = create_manager_decision(
        trigger_type=trigger_type,
        decision="full_pipeline",  # For v1, always full pipeline
        reason=f"User scenario triggered: {payload.get('scenario_text', 'N/A')[:100]}",
        skip_perception=False,
        skip_planning=False,
        cost_hint="medium",
        agents_to_invoke=["PerceptionPipeline", "RiskReasonerCoordinator", "PlanningCoordinator", "ActionCoordinator"],
        fallback_if_failure="continue_without"
    )
    
    # Log decision to audit_log
    try:
        supabase.table("audit_log").insert({
            "event_type": "manager_decision",
            "actor": "OmniManager",
            "payload": decision
        }).execute()
    except Exception as e:
        print(f"Error logging manager decision: {e}")
    
    # Update session
    update_session(session_id, pipeline_runs=1, agent_invoked="OmniManager")
    
    # For v1, delegate to existing agent_runner logic
    # In v2, this would invoke the ADK manager agent directly
    try:
        from backend.services.agent_runner import run_risk_assessment
        
        scenario_text = payload.get("scenario_text") or payload.get("trigger", "")
        severity = payload.get("severity", 50)
        urgency = payload.get("urgency", 50)
        run_context = {
            "focus_suppliers": payload.get("focus_suppliers"),
            "focus_materials": payload.get("focus_materials"),
            "flagged_regions": payload.get("flagged_regions"),
            "directives": payload.get("directives"),
            "budget_flexibility": payload.get("budget_flexibility"),
            "risk_tolerance": payload.get("risk_tolerance"),
            "timeline": payload.get("timeline"),
        }
        
        result = await run_risk_assessment(
            company_id=company_id,
            scenario_text=scenario_text,
            severity=severity,
            urgency=urgency,
            run_context=run_context
        )
        
        # Update session with results
        if result.get("case_id"):
            update_session(session_id, case_created=result["case_id"])
            update_session(session_id, action_pending=True)
        
        # Update session with last pipeline run time
        supabase.table("manager_sessions").update({
            "last_pipeline_run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }).eq("session_id", session_id).execute()
        
        return result
        
    except Exception as e:
        # Log failure
        try:
            supabase.table("audit_log").insert({
                "event_type": "agent_failure",
                "actor": "OmniManager",
                "payload": {
                    "agent_name": "run_risk_assessment",
                    "error_message": str(e),
                    "context": f"trigger_type={trigger_type}, company_id={company_id}",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                }
            }).execute()
        except:
            pass
        
        # Update session with warning
        update_session(session_id, warning=f"Pipeline execution failed: {str(e)[:200]}")
        
        # Fallback: return error but don't crash
        return {
            "status": "error",
            "message": str(e),
            "fallback": "Manager logged failure and continued"
        }


async def run_perception_with_manager(
    company_id: str,
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Runs perception pipeline through manager (for scheduled polls).
    
    Args:
        company_id: Organization ID
        session_id: Optional session ID
    
    Returns:
        Result dict
    """
    session = get_or_create_session(company_id, session_id)
    session_id = session["session_id"]
    
    # Check if recent perception data exists
    # Get supplier countries
    supp_res = supabase.table("suppliers").select("country").execute()
    countries = list({s["country"] for s in (supp_res.data or []) if s.get("country")})
    
    # Check for recent signal_events (within 15 minutes)
    cutoff_time = time.time() - (15 * 60)  # 15 minutes ago
    cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
    
    recent_res = supabase.table("signal_events").select("created_at").in_("country", countries[:10]).gte("created_at", cutoff_str).order("created_at", desc=True).limit(1).execute()
    
    recent_check = {"has_recent": bool(recent_res.data), "latest": recent_res.data[0].get("created_at") if recent_res.data else None}
    
    if recent_check.get("has_recent"):
        # Skip perception, reuse existing data
        decision = create_manager_decision(
            trigger_type="scheduled",
            decision="perception_only",
            reason=f"Recent perception data exists ({recent_check.get('latest')}), skipping fetch.",
            skip_perception=True,
            skip_planning=True,
            cost_hint="low"
        )
    else:
        # Run perception
        decision = create_manager_decision(
            trigger_type="scheduled",
            decision="perception_only",
            reason="No recent perception data, fetching fresh signals.",
            skip_perception=False,
            skip_planning=True,
            cost_hint="medium",
            agents_to_invoke=["PerceptionPipeline"]
        )
    
    # Log decision
    try:
        supabase.table("audit_log").insert({
            "event_type": "manager_decision",
            "actor": "OmniManager",
            "payload": decision
        }).execute()
    except Exception as e:
        print(f"Error logging manager decision: {e}")
    
    update_session(session_id, agent_invoked="PerceptionPipeline")
    
    # For v1, call perception service directly
    # In v2, this would invoke the ADK perception pipeline via manager
    if not recent_check.get("has_recent"):
        try:
            from backend.services.perception_service import run_perception_scan
            result = await run_perception_scan(company_id=company_id)
            return {"status": "completed", "perception": result}
        except Exception as e:
            update_session(session_id, warning=f"Perception scan failed: {str(e)[:200]}")
            return {"status": "error", "message": str(e)}
    else:
        return {"status": "skipped", "reason": "recent_data_exists", "latest": recent_check.get("latest")}
