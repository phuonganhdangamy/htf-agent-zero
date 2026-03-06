"""
Escalation service — checks new signal events against the company's notification_threshold
and auto-triggers run_pipeline() for high-confidence signals.
"""
from typing import Any, Dict, List
from backend.services.supabase_client import supabase


async def auto_escalate_signals(signal_events: List[Dict[str, Any]], company_id: str = "ORG_DEMO") -> List[str]:
    """
    For each newly-saved signal event, check if confidence_score * 100 >= notification_threshold.
    If so, and no open risk case already exists for that country+event_type, auto-run the pipeline
    and insert an alert row.

    Returns list of case_ids that were auto-escalated.
    """
    if not signal_events:
        return []

    # Fetch notification_threshold from memory_preferences (default 60)
    try:
        prefs_res = supabase.table("memory_preferences").select("objectives").eq("org_id", company_id).maybeSingle().execute()
        objectives = (prefs_res.data or {}).get("objectives") or {}
        threshold = float(objectives.get("notification_threshold", 60))
    except Exception:
        threshold = 60.0

    escalated_case_ids: List[str] = []

    for event in signal_events:
        confidence = float(event.get("confidence_score", 0) or 0)
        effective_score = confidence * 100

        if effective_score < threshold:
            continue

        country = event.get("country", "")
        event_type = event.get("event_type", "")

        # Avoid duplicate auto-runs: skip if open risk case already exists for this country+event_type
        try:
            existing = supabase.table("risk_cases").select("case_id").eq("status", "open").execute()
            # Simple check: any open case headline mentioning the country
            open_cases = existing.data or []
            already_covered = any(
                country.lower() in (c.get("headline") or "").lower()
                for c in open_cases
            )
            if already_covered:
                continue
        except Exception:
            pass

        # Auto-trigger pipeline
        try:
            from backend.services.agent_runner import run_pipeline
            trigger_text = event.get("title") or f"{event_type} disruption in {country}"
            result = await run_pipeline(
                company_id=company_id,
                trigger=trigger_text,
                context={
                    "signal_event": event,
                    "auto_escalated": True,
                    "scenario_text": event.get("summary") or trigger_text,
                }
            )
            case_id = result.get("case_id")

            # Insert alert
            severity = "critical" if effective_score >= 85 else "high" if effective_score >= 70 else "elevated"
            supabase.table("alerts").insert({
                "case_id": case_id,
                "severity": severity,
                "message": f"Auto-escalated: {trigger_text} (confidence: {effective_score:.0f}%)",
            }).execute()

            if case_id:
                escalated_case_ids.append(case_id)

        except Exception as e:
            print(f"[escalation] Failed to escalate signal {event.get('event_id')}: {e}")

    return escalated_case_ids
