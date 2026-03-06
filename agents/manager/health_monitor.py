"""
Health Monitor - Scheduled background health checks for agents and system components.
Runs every 5 minutes and writes results to audit_log.
"""
import time
from typing import Dict, Any, List
from backend.services.supabase_client import supabase
from backend.routers.monitoring import full_health_check


def check_perception_freshness() -> Dict[str, Any]:
    """
    Checks if perception data is fresh (last run within 30 minutes).
    
    Returns:
        Dict with status and detail
    """
    try:
        # Get most recent signal_event
        res = supabase.table("signal_events").select("created_at").order("created_at", desc=True).limit(1).execute()
        
        if not res.data:
            return {
                "name": "Perception Freshness",
                "status": "warning",
                "detail": "No signal events found. Perception may not have run yet."
            }
        
        latest = res.data[0].get("created_at")
        if not latest:
            return {
                "name": "Perception Freshness",
                "status": "warning",
                "detail": "Could not determine last perception run time."
            }
        
        # Parse timestamp and check age
        from datetime import datetime
        try:
            if isinstance(latest, str):
                latest_dt = datetime.fromisoformat(latest.replace("Z", "+00:00"))
            else:
                latest_dt = latest
            
            age_minutes = (time.time() - latest_dt.timestamp()) / 60
            
            if age_minutes > 30:
                return {
                    "name": "Perception Freshness",
                    "status": "warning",
                    "detail": f"Last perception run was {int(age_minutes)} minutes ago (threshold: 30 min)."
                }
            else:
                return {
                    "name": "Perception Freshness",
                    "status": "ok",
                    "detail": f"Perception data is fresh ({int(age_minutes)} minutes old)."
                }
        except Exception as e:
            return {
                "name": "Perception Freshness",
                "status": "error",
                "detail": f"Error parsing timestamp: {str(e)}"
            }
    except Exception as e:
        return {
            "name": "Perception Freshness",
            "status": "error",
            "detail": str(e)[:200]
        }


def check_stalled_cases() -> Dict[str, Any]:
    """
    Checks for risk cases that are stalled (open > 2 hours with no execution_steps).
    
    Returns:
        Dict with status and list of stalled case IDs
    """
    try:
        cutoff_time = time.time() - (2 * 3600)  # 2 hours ago
        cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
        
        res = supabase.table("risk_cases").select("case_id, created_at, execution_steps").eq("status", "open").lt("created_at", cutoff_str).execute()
        
        stalled = []
        for case in (res.data or []):
            steps = case.get("execution_steps") or []
            if not steps or len(steps) == 0:
                stalled.append(case.get("case_id"))
        
        if stalled:
            return {
                "name": "Stalled Cases",
                "status": "warning",
                "detail": f"Found {len(stalled)} stalled case(s): {', '.join(stalled[:3])}{'...' if len(stalled) > 3 else ''}"
            }
        else:
            return {
                "name": "Stalled Cases",
                "status": "ok",
                "detail": "No stalled cases detected."
            }
    except Exception as e:
        return {
            "name": "Stalled Cases",
            "status": "error",
            "detail": str(e)[:200]
        }


def check_expired_proposals() -> Dict[str, Any]:
    """
    Checks for change proposals past approval_expiry_hours.
    Auto-escalates if found.
    
    Returns:
        Dict with status and escalated proposal IDs
    """
    try:
        # Get approval_expiry_hours from memory_preferences (default 24 hours)
        prefs_res = supabase.table("memory_preferences").select("objectives").limit(1).execute()
        expiry_hours = 24
        if prefs_res.data:
            obj = prefs_res.data[0].get("objectives") or {}
            expiry_hours = obj.get("approval_expiry_hours", 24)
        
        cutoff_time = time.time() - (expiry_hours * 3600)
        cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
        
        res = supabase.table("change_proposals").select("proposal_id, created_at").eq("status", "pending").lt("created_at", cutoff_str).execute()
        
        expired = [p.get("proposal_id") for p in (res.data or [])]
        
        if expired:
            # Auto-escalate
            for prop_id in expired:
                supabase.table("change_proposals").update({
                    "status": "escalated",
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                }).eq("proposal_id", prop_id).execute()
                
                # Write alert
                supabase.table("alerts").insert({
                    "alert_type": "proposal_expired",
                    "severity": "high",
                    "message": f"Change proposal {prop_id} expired and was auto-escalated.",
                    "read": False,
                    "metadata": {"proposal_id": prop_id}
                }).execute()
            
            return {
                "name": "Expired Proposals",
                "status": "warning",
                "detail": f"Escalated {len(expired)} expired proposal(s): {', '.join(expired[:3])}{'...' if len(expired) > 3 else ''}"
            }
        else:
            return {
                "name": "Expired Proposals",
                "status": "ok",
                "detail": "No expired proposals found."
            }
    except Exception as e:
        return {
            "name": "Expired Proposals",
            "status": "error",
            "detail": str(e)[:200]
        }


def check_agent_failure_rate() -> Dict[str, Any]:
    """
    Checks agent failure rate in the last hour.
    Alerts if > 3 failures.
    
    Returns:
        Dict with status and failure count
    """
    try:
        cutoff_time = time.time() - 3600  # 1 hour ago
        cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
        
        res = supabase.table("audit_log").select("id").eq("event_type", "agent_failure").gte("created_at", cutoff_str).execute()
        
        failure_count = len(res.data or [])
        
        if failure_count > 3:
            # Write CRITICAL alert
            supabase.table("alerts").insert({
                "alert_type": "agent_failure_rate",
                "severity": "critical",
                "message": f"Multiple agent failures detected: {failure_count} failures in the last hour.",
                "read": False,
                "metadata": {"failure_count": failure_count}
            }).execute()
            
            return {
                "name": "Agent Failure Rate",
                "status": "critical",
                "detail": f"{failure_count} agent failures in the last hour (threshold: 3)."
            }
        else:
            return {
                "name": "Agent Failure Rate",
                "status": "ok",
                "detail": f"{failure_count} agent failure(s) in the last hour (acceptable)."
            }
    except Exception as e:
        return {
            "name": "Agent Failure Rate",
            "status": "error",
            "detail": str(e)[:200]
        }


def check_gemini_connectivity() -> Dict[str, Any]:
    """
    Checks Gemini API connectivity with a simple test call.
    
    Returns:
        Dict with status
    """
    try:
        import os
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
        if not api_key:
            return {
                "name": "Gemini Connectivity",
                "status": "error",
                "detail": "GOOGLE_API_KEY not set."
            }
        
        from google import genai
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Reply with exactly: OK"
        )
        
        text = (response.text or "").strip()
        if "OK" in text:
            return {
                "name": "Gemini Connectivity",
                "status": "ok",
                "detail": "AI model is online and responding correctly."
            }
        else:
            return {
                "name": "Gemini Connectivity",
                "status": "warning",
                "detail": f"Unexpected response: {text[:50]}"
            }
    except Exception as e:
        # Write CRITICAL alert
        supabase.table("alerts").insert({
            "alert_type": "gemini_connectivity",
            "severity": "critical",
            "message": f"Gemini API connectivity check failed: {str(e)[:200]}",
            "read": False
        }).execute()
        
        return {
            "name": "Gemini Connectivity",
            "status": "critical",
            "detail": f"Connectivity check failed: {str(e)[:200]}"
        }


def run_all_health_checks() -> Dict[str, Any]:
    """
    Runs all health checks and writes results to audit_log.
    
    Returns:
        Dict with overall status and list of check results
    """
    checks = []
    
    # Run custom checks
    checks.append(check_perception_freshness())
    checks.append(check_stalled_cases())
    checks.append(check_expired_proposals())
    checks.append(check_agent_failure_rate())
    checks.append(check_gemini_connectivity())
    
    # Also run comprehensive health check from monitoring router
    try:
        comprehensive = full_health_check()
        checks.append({
            "name": "Comprehensive Health Check",
            "status": comprehensive.get("overall", "unknown"),
            "detail": f"{comprehensive.get('passed', 0)}/{comprehensive.get('total', 0)} checks passed."
        })
    except Exception as e:
        checks.append({
            "name": "Comprehensive Health Check",
            "status": "error",
            "detail": str(e)[:200]
        })
    
    # Determine overall status
    statuses = [c.get("status") for c in checks]
    if "critical" in statuses:
        overall = "critical"
    elif "error" in statuses:
        overall = "degraded"
    elif "warning" in statuses:
        overall = "warning"
    else:
        overall = "healthy"
    
    # Write to audit_log
    try:
        supabase.table("audit_log").insert({
            "event_type": "health_check",
            "actor": "HealthMonitor",
            "payload": {
                "overall": overall,
                "checks": checks,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
        }).execute()
    except Exception as e:
        print(f"Error writing health check to audit_log: {e}")
    
    return {
        "overall": overall,
        "checks": checks,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
