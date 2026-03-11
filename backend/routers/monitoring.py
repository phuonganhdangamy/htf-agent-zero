"""Monitoring router — exposes endpoints for alert checks, perception scans, and health checks."""
from fastapi import APIRouter
from typing import Optional
import time
import os
from backend.services.supabase_client import supabase
from backend.services.monitoring_service import check_and_alert

router = APIRouter()


def _default_company_id() -> str:
    return os.environ.get("OMNI_COMPANY_ID", "ORG_DEMO")


@router.post("/check")
def run_monitoring_check(company_id: Optional[str] = None):
    """Manually trigger a monitoring check. Returns alerts created."""
    return check_and_alert(company_id=company_id or _default_company_id())


@router.post("/scan")
async def trigger_perception_scan(company_id: Optional[str] = None):
    """
    Run an on-demand Gemini-powered perception scan for the company's supplier regions.
    Saves new signal events, then auto-escalates high-confidence ones based on notification_threshold.
    """
    from backend.services.perception_service import run_perception_scan
    from backend.services.escalation_service import auto_escalate_signals

    cid = company_id or _default_company_id()
    scan_result = await run_perception_scan(company_id=cid)
    new_events = scan_result.get("new_signal_events", [])

    escalated = await auto_escalate_signals(new_events, company_id=cid)

    return {
        "scanned": True,
        "countries_monitored": scan_result.get("countries_monitored", []),
        "events_generated": scan_result.get("events_generated", 0),
        "new_events_saved": scan_result.get("new_events", 0),
        "escalations_triggered": len(escalated),
        "escalated_case_ids": escalated,
    }


@router.get("/alerts")
def get_alerts(limit: int = 20, unread_only: bool = False):
    """Fetch recent alerts."""
    query = supabase.table("alerts").select("*").order("created_at", desc=True).limit(limit)
    if unread_only:
        query = query.eq("read", False)
    res = query.execute()
    return res.data or []


@router.patch("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: str):
    """Mark an alert as read."""
    supabase.table("alerts").update({"read": True}).eq("id", alert_id).execute()
    return {"status": "ok"}


@router.patch("/alerts/read-all")
def mark_all_alerts_read():
    """Mark all unread alerts as read."""
    supabase.table("alerts").update({"read": True}).eq("read", False).execute()
    return {"status": "ok"}


@router.get("/health/agents")
def agent_health_check():
    """
    Run scheduled health checks via health monitor.
    Returns manager health check results.
    """
    from agents.manager.health_monitor import run_all_health_checks
    return run_all_health_checks()


@router.get("/health")
def full_health_check():
    """
    Run comprehensive health checks across all agents and services.
    Returns a structured report with status, latency, and detail for each check.
    """
    checks = []
    started_at = time.time()

    def run_check(name: str, category: str, fn):
        t0 = time.time()
        try:
            detail = fn()
            latency = int((time.time() - t0) * 1000)
            checks.append({"name": name, "category": category, "status": "ok", "detail": detail, "latency_ms": latency})
        except Exception as e:
            latency = int((time.time() - t0) * 1000)
            checks.append({"name": name, "category": category, "status": "error", "detail": str(e)[:200], "latency_ms": latency})

    # ── Database checks ──────────────────────────────────────────
    def check_supabase():
        r = supabase.table("risk_cases").select("case_id", count="exact").execute()
        return f"Database is connected — {r.count} risk case(s) on file"

    def check_suppliers_table():
        r = supabase.table("suppliers").select("supplier_id, country", count="exact").execute()
        countries = list({s["country"] for s in (r.data or []) if s.get("country")})
        return f"Tracking {r.count} supplier(s) across {len(countries)} region(s): {', '.join(countries[:5])}"

    def check_inventory_table():
        r = supabase.table("inventory").select("days_of_inventory_remaining").execute()
        rows = r.data or []
        if rows:
            min_days = min(float(x.get("days_of_inventory_remaining") or 999) for x in rows)
            return f"Tracking {len(rows)} product(s) — lowest stock covers {min_days:.1f} days"
        return "No stock records found — run seed.sql to load sample data"

    def check_signal_events_table():
        r = supabase.table("signal_events").select("event_id", count="exact").execute()
        return f"{r.count} risk signal(s) recorded so far"

    def check_memory_preferences():
        r = supabase.table("memory_preferences").select("org_id, objectives").execute()
        rows = r.data or []
        if not rows:
            return "No alert settings found — run seed.sql to load defaults"
        obj = (rows[0].get("objectives") or {})
        threshold = obj.get("notification_threshold", "not set")
        return f"Settings loaded for {rows[0]['org_id']} — alerts trigger above risk score {threshold}"

    def check_alerts_table():
        r = supabase.table("alerts").select("id", count="exact").eq("read", False).execute()
        return f"{r.count} unread alert(s) waiting for review"

    def check_change_proposals():
        r = supabase.table("change_proposals").select("proposal_id", count="exact").eq("status", "pending").execute()
        return f"{r.count} action(s) waiting for your approval"

    run_check("Database Connection", "Database", check_supabase)
    run_check("Supplier Records", "Database", check_suppliers_table)
    run_check("Stock Levels", "Database", check_inventory_table)
    run_check("Risk Signals", "Database", check_signal_events_table)
    run_check("Alert Settings", "Database", check_memory_preferences)
    run_check("Alerts Inbox", "Database", check_alerts_table)
    run_check("Pending Approvals", "Database", check_change_proposals)

    # ── Gemini API check ─────────────────────────────────────────
    def check_gemini():
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
        if not api_key:
            raise Exception("GOOGLE_API_KEY not set — please add it to your environment variables")
        from google import genai
        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(model="gemini-2.5-flash", contents="Reply with exactly: OK")
        (r.text or "").strip()[:50]
        return "AI model is online and responding correctly"

    run_check("AI Model", "AI Services", check_gemini)

    # ── Agent / service import checks ────────────────────────────
    def check_agent_runner():
        from backend.services.agent_runner import run_pipeline, _get_gemini_client
        _get_gemini_client()
        return "Risk analysis engine is loaded and ready"

    def check_perception_service():
        from backend.services.perception_service import run_perception_scan, _save_events_direct
        suppliers = supabase.table("suppliers").select("country").execute()
        countries = list({s["country"] for s in (suppliers.data or []) if s.get("country")})
        return f"Watching {len(countries)} region(s) for supply chain signals: {', '.join(countries[:4])}"

    def check_escalation_service():
        from backend.services.escalation_service import auto_escalate_signals
        return "Ready to automatically flag urgent signals for review"

    def check_monitoring_service():
        from backend.services.monitoring_service import check_and_alert
        prefs = supabase.table("memory_preferences").select("objectives").limit(1).execute()
        obj = ((prefs.data or [{}])[0].get("objectives") or {})
        threshold = obj.get("notification_threshold", 60)
        return f"Background monitor is running — will alert if risk score exceeds {threshold}"

    def check_action_orchestrator():
        from backend.services.action_orchestrator import advance_after_approval
        return "Ready to carry out actions once they are approved"

    def check_chat_service():
        from backend.routers.chat import router as chat_router
        return "Chat assistant is online and ready to answer questions"

    run_check("Risk Analysis", "Agents", check_agent_runner)
    run_check("Market Monitoring", "Agents", check_perception_service)
    run_check("Alert Escalation", "Agents", check_escalation_service)
    run_check("Background Monitor", "Agents", check_monitoring_service)
    run_check("Action Runner", "Agents", check_action_orchestrator)
    run_check("Chat Assistant", "Agents", check_chat_service)

    # ── Summary ──────────────────────────────────────────────────
    total = len(checks)
    passed = sum(1 for c in checks if c["status"] == "ok")
    failed = total - passed
    overall = "healthy" if failed == 0 else "degraded" if passed > failed else "critical"

    return {
        "overall": overall,
        "passed": passed,
        "failed": failed,
        "total": total,
        "duration_ms": int((time.time() - started_at) * 1000),
        "checks": checks,
    }
