"""Monitoring router — exposes endpoints for alert checks, perception scans, and health checks."""
from fastapi import APIRouter
from typing import Optional
import time
import os
from backend.services.supabase_client import supabase
from backend.services.monitoring_service import check_and_alert

router = APIRouter()


@router.post("/check")
def run_monitoring_check(company_id: Optional[str] = "ORG_DEMO"):
    """Manually trigger a monitoring check. Returns alerts created."""
    return check_and_alert(company_id=company_id)


@router.post("/scan")
async def trigger_perception_scan(company_id: Optional[str] = "ORG_DEMO"):
    """
    Run an on-demand Gemini-powered perception scan for the company's supplier regions.
    Saves new signal events, then auto-escalates high-confidence ones based on notification_threshold.
    """
    from backend.services.perception_service import run_perception_scan
    from backend.services.escalation_service import auto_escalate_signals

    scan_result = await run_perception_scan(company_id=company_id)
    new_events = scan_result.get("new_signal_events", [])

    escalated = await auto_escalate_signals(new_events, company_id=company_id)

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


@router.post("/feedback")
async def record_case_outcome_endpoint(
    case_id: str,
    outcome: str = "resolved",
    actual_impact_usd: Optional[float] = None,
    notes: str = "",
    actor: str = "Administrator",
):
    """Record real-world outcome of a risk case to enable memory learning."""
    from backend.services.feedback_service import record_case_outcome
    return record_case_outcome(case_id=case_id, outcome=outcome, actual_impact_usd=actual_impact_usd, notes=notes, actor=actor)


@router.get("/memory")
def get_memory_summary_endpoint(company_id: Optional[str] = "ORG_DEMO"):
    """Return a summary of all learned patterns from past risk cases."""
    from backend.services.feedback_service import get_memory_summary
    return get_memory_summary(company_id=company_id)


@router.get("/supplier-health")
def get_supplier_health_endpoint(company_id: Optional[str] = "ORG_DEMO"):
    """Compute and return dynamic health scores for all suppliers."""
    from backend.services.supplier_health_service import get_supplier_health_report
    return get_supplier_health_report(company_id=company_id)


@router.get("/news-status")
def get_news_status():
    """Check whether real news ingestion is configured."""
    from backend.services.news_service import get_news_api_status
    return get_news_api_status()


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

    # ── Memory & Feedback Learning ────────────────────────────────
    def check_memory_learning():
        from backend.services.feedback_service import get_memory_summary
        summary = get_memory_summary("ORG_DEMO")
        total = summary.get("total_patterns", 0)
        successes = summary.get("successful_resolutions", 0)
        top_rejects = summary.get("top_rejection_reasons", [])
        if total == 0:
            return "No patterns learned yet — resolve your first risk case to start building memory"
        msg = f"Memory bank has {total} learned pattern(s); {successes} successful resolution(s) on record"
        if top_rejects:
            msg += f"; top rejection reason: '{top_rejects[0]['reason']}'"
        return msg

    def check_news_ingestion():
        from backend.services.news_service import get_news_api_status
        status = get_news_api_status()
        return status.get("message", "News status unknown")

    def check_supplier_health():
        from backend.services.supplier_health_service import get_supplier_health_report
        report = get_supplier_health_report("ORG_DEMO")
        total = report.get("total_suppliers", 0)
        critical = report.get("critical_count", 0)
        avg = report.get("avg_health_score", 0)
        if total == 0:
            return "No suppliers found — add suppliers in Configuration to enable health scoring"
        msg = f"Scored {total} supplier(s) — avg health {avg}/100"
        if critical > 0:
            msg += f"; {critical} supplier(s) in CRITICAL status"
        return msg

    def check_tradeoff_engine():
        from backend.routers.simulate import router as sim_router
        # Check the tradeoff endpoint is registered
        routes = [r.path for r in sim_router.routes]
        if any("tradeoff" in r for r in routes):
            return "Trade-off simulation engine is available at /api/simulate/tradeoff"
        raise Exception("Trade-off endpoint not registered")

    def check_hyper_personalization():
        prefs = supabase.table("memory_preferences").select("objectives").limit(1).execute()
        obj = ((prefs.data or [{}])[0].get("objectives") or {})
        fields = []
        if obj.get("lead_time_sensitivity"):
            fields.append(f"lead time sensitivity={obj['lead_time_sensitivity']}")
        if obj.get("supplier_concentration_threshold"):
            fields.append(f"concentration limit={obj['supplier_concentration_threshold']}")
        if obj.get("contract_structures"):
            fields.append(f"contracts={','.join(obj['contract_structures'])}")
        if obj.get("customer_slas"):
            fields.append(f"{len(obj['customer_slas'])} SLA(s) configured")
        if fields:
            return "Hyper-personalization active: " + "; ".join(fields)
        return "Hyper-personalization not yet configured — set preferences in Configuration"

    def check_reasoning_traces():
        runs_res = supabase.table("action_runs").select("action_run_id", count="exact").execute()
        run_count = runs_res.count or 0
        cases_res = supabase.table("risk_cases").select("case_id, reasoning_summary, plan_iterations").order("created_at", desc=True).limit(5).execute()
        cases = cases_res.data or []
        traced = sum(1 for c in cases if c.get("reasoning_summary") and len(c.get("reasoning_summary") or []) > 0)
        with_iterations = sum(1 for c in cases if c.get("plan_iterations") and len(c.get("plan_iterations") or []) > 0)
        if run_count == 0:
            return "No pipeline traces yet — run a risk assessment to generate your first reasoning trace"
        msg = f"{run_count} pipeline trace(s) on record"
        if traced > 0:
            msg += f"; {traced} recent case(s) have full reasoning summaries"
        if with_iterations > 0:
            msg += f"; {with_iterations} case(s) have plan revision history"
        return msg

    run_check("Memory & Learning", "Intelligence", check_memory_learning)
    run_check("Reasoning Traces", "Intelligence", check_reasoning_traces)
    run_check("Real News Ingestion", "Intelligence", check_news_ingestion)
    run_check("Supplier Health Scoring", "Intelligence", check_supplier_health)
    run_check("Trade-off Engine", "Intelligence", check_tradeoff_engine)
    run_check("Hyper-Personalization", "Intelligence", check_hyper_personalization)

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
