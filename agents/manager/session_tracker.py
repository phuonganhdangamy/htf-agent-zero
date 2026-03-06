"""
Session Tracker - Maintains session state and generates summaries for chatbot context.
"""
import json
import time
from typing import Dict, Any, Optional, List
from backend.services.supabase_client import supabase
import os
from google import genai


def get_or_create_session(org_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Gets existing session or creates a new one.
    
    Args:
        org_id: Organization ID (e.g., "ORG_DEMO")
        session_id: Optional session ID. If None, creates new session.
    
    Returns:
        Session dict from database
    """
    if session_id:
        res = supabase.table("manager_sessions").select("*").eq("session_id", session_id).execute()
        if res.data:
            return res.data[0]
    
    # Create new session
    new_session_id = f"SESS_{int(time.time())}_{str(time.time()).split('.')[-1][:6]}"
    session_data = {
        "session_id": new_session_id,
        "org_id": org_id,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pipeline_runs": 0,
        "cases_created": [],
        "actions_approved": 0,
        "actions_pending": 0,
        "agents_invoked": [],
        "warnings": [],
        "session_summary": None
    }
    
    supabase.table("manager_sessions").insert(session_data).execute()
    return session_data


def update_session(
    session_id: str,
    pipeline_runs: Optional[int] = None,
    case_created: Optional[str] = None,
    action_approved: bool = False,
    action_pending: bool = False,
    agent_invoked: Optional[str] = None,
    warning: Optional[str] = None
) -> Dict[str, Any]:
    """
    Updates session state with new activity.
    
    Args:
        session_id: Session ID
        pipeline_runs: Increment pipeline run count
        case_created: Case ID to add to cases_created list
        action_approved: Increment actions_approved
        action_pending: Increment actions_pending
        agent_invoked: Agent name to add to agents_invoked list
        warning: Warning message to add to warnings list
    
    Returns:
        Updated session dict
    """
    res = supabase.table("manager_sessions").select("*").eq("session_id", session_id).execute()
    if not res.data:
        raise ValueError(f"Session not found: {session_id}")
    
    current = res.data[0]
    updates = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    if pipeline_runs is not None:
        updates["pipeline_runs"] = (current.get("pipeline_runs") or 0) + pipeline_runs
    
    if case_created:
        cases = list(current.get("cases_created") or [])
        if case_created not in cases:
            cases.append(case_created)
        updates["cases_created"] = cases
    
    if action_approved:
        updates["actions_approved"] = (current.get("actions_approved") or 0) + 1
    
    if action_pending:
        updates["actions_pending"] = (current.get("actions_pending") or 0) + 1
    
    if agent_invoked:
        agents = list(current.get("agents_invoked") or [])
        if agent_invoked not in agents:
            agents.append(agent_invoked)
        updates["agents_invoked"] = agents
    
    if warning:
        warnings = list(current.get("warnings") or [])
        if warning not in warnings:
            warnings.append(warning)
        updates["warnings"] = warnings
    
    supabase.table("manager_sessions").update(updates).eq("session_id", session_id).execute()
    
    # Return updated session
    res = supabase.table("manager_sessions").select("*").eq("session_id", session_id).execute()
    return res.data[0] if res.data else current


def generate_session_summary(session_id: str) -> str:
    """
    Generates a 2-3 sentence summary of session activity using Gemini.
    
    Args:
        session_id: Session ID
    
    Returns:
        Summary string
    """
    res = supabase.table("manager_sessions").select("*").eq("session_id", session_id).execute()
    if not res.data:
        return "No session data available."
    
    session = res.data[0]
    
    # Build context for summary
    context = {
        "pipeline_runs": session.get("pipeline_runs", 0),
        "cases_created": session.get("cases_created", []),
        "actions_approved": session.get("actions_approved", 0),
        "actions_pending": session.get("actions_pending", 0),
        "agents_invoked": session.get("agents_invoked", []),
        "warnings": session.get("warnings", [])
    }
    
    # Use Gemini to generate concise summary
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
    if not api_key:
        # Fallback to simple text summary
        return _fallback_summary(context)
    
    try:
        client = genai.Client(api_key=api_key)
        prompt = f"""Generate a 2-3 sentence summary of what Omni has done in this session.

Session activity:
- Pipeline runs: {context['pipeline_runs']}
- Risk cases created: {len(context['cases_created'])} ({', '.join(context['cases_created'][:3])}{'...' if len(context['cases_created']) > 3 else ''})
- Actions approved: {context['actions_approved']}
- Actions pending: {context['actions_pending']}
- Agents invoked: {', '.join(context['agents_invoked'][:5])}{'...' if len(context['agents_invoked']) > 5 else ''}
- Warnings: {len(context['warnings'])} ({', '.join(context['warnings'][:2])}{'...' if len(context['warnings']) > 2 else ''} if any)

Keep it concise and natural. Focus on what was accomplished."""
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        
        summary = response.text if hasattr(response, "text") else ""
        if summary:
            # Update session with summary
            supabase.table("manager_sessions").update({
                "session_summary": summary.strip()
            }).eq("session_id", session_id).execute()
            return summary.strip()
    except Exception as e:
        print(f"Error generating session summary: {e}")
    
    return _fallback_summary(context)


def _fallback_summary(context: Dict[str, Any]) -> str:
    """Fallback text summary if Gemini call fails."""
    parts = []
    if context["pipeline_runs"] > 0:
        parts.append(f"Ran {context['pipeline_runs']} pipeline execution(s).")
    if context["cases_created"]:
        parts.append(f"Created {len(context['cases_created'])} risk case(s).")
    if context["actions_approved"] > 0:
        parts.append(f"Approved {context['actions_approved']} action(s).")
    if context["actions_pending"] > 0:
        parts.append(f"{context['actions_pending']} action(s) pending approval.")
    if context["warnings"]:
        parts.append(f"{len(context['warnings'])} warning(s) encountered.")
    
    return " ".join(parts) if parts else "No activity recorded in this session."


def get_latest_session_summary(org_id: str) -> Optional[str]:
    """
    Gets the latest session summary for an organization.
    Used by chatbot to answer "what has Omni done today?"
    
    Args:
        org_id: Organization ID
    
    Returns:
        Summary string or None
    """
    res = supabase.table("manager_sessions").select("session_summary").eq("org_id", org_id).order("updated_at", desc=True).limit(1).execute()
    if res.data and res.data[0].get("session_summary"):
        return res.data[0]["session_summary"]
    return None


def get_session_stats(org_id: str) -> Dict[str, Any]:
    """
    Gets aggregated session statistics for an organization.
    
    Args:
        org_id: Organization ID
    
    Returns:
        Stats dict with counts and recent activity
    """
    res = supabase.table("manager_sessions").select("*").eq("org_id", org_id).order("updated_at", desc=True).limit(10).execute()
    sessions = res.data or []
    
    if not sessions:
        return {
            "total_sessions": 0,
            "total_pipeline_runs": 0,
            "total_cases_created": 0,
            "total_actions_approved": 0,
            "pending_actions": 0,
            "recent_warnings": []
        }
    
    total_runs = sum(s.get("pipeline_runs", 0) for s in sessions)
    all_cases = []
    total_approved = sum(s.get("actions_approved", 0) for s in sessions)
    total_pending = sum(s.get("actions_pending", 0) for s in sessions)
    all_warnings = []
    
    for s in sessions:
        all_cases.extend(s.get("cases_created") or [])
        all_warnings.extend(s.get("warnings") or [])
    
    return {
        "total_sessions": len(sessions),
        "total_pipeline_runs": total_runs,
        "total_cases_created": len(set(all_cases)),
        "total_actions_approved": total_approved,
        "pending_actions": total_pending,
        "recent_warnings": list(set(all_warnings))[:5]
    }
