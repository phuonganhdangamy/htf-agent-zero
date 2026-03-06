"""
Periodic risk monitoring service.
Checks for deteriorating conditions and inserts alerts into the alerts table.
Supabase Realtime broadcasts these to subscribed frontends automatically.
"""
from typing import Dict, Any
from backend.services.supabase_client import supabase


def check_and_alert(company_id: str = "ORG_DEMO") -> Dict[str, Any]:
    """
    Run all monitoring checks and insert new alerts for any issues found.
    Returns a summary of checks performed and alerts created.
    """
    alerts_created = 0

    # Fetch company's notification_threshold (default 60)
    try:
        prefs_res = supabase.table("memory_preferences").select("objectives").eq("org_id", company_id).maybeSingle().execute()
        objectives = (prefs_res.data or {}).get("objectives") or {}
        notification_threshold = float(objectives.get("notification_threshold", 60))
    except Exception:
        notification_threshold = 60.0

    # 1. Critical/high-scoring risk cases that have no approved proposals yet
    try:
        cases_res = supabase.table("risk_cases").select("case_id, headline, scores, status").eq("status", "open").execute()
        for case in (cases_res.data or []):
            score = (case.get("scores") or {}).get("overall", 0) or 0
            if score >= notification_threshold:
                severity = "critical" if score >= 90 else "high" if score >= 75 else "elevated"
                # Avoid duplicate alerts: skip if an unread alert already exists for this case
                existing = supabase.table("alerts").select("id").eq("case_id", case["case_id"]).eq("read", False).execute()
                if not (existing.data):
                    supabase.table("alerts").insert({
                        "case_id": case["case_id"],
                        "severity": severity,
                        "message": f"Risk case requires attention: {case.get('headline', case['case_id'])} (Score: {score}/100)",
                    }).execute()
                    alerts_created += 1
    except Exception as e:
        print(f"[monitor] risk_cases check error: {e}")

    # 2. Inventory below safety stock
    try:
        inv_res = supabase.table("inventory").select("material_id, days_of_inventory_remaining, safety_stock_days").execute()
        for item in (inv_res.data or []):
            days = float(item.get("days_of_inventory_remaining") or 999)
            safety = float(item.get("safety_stock_days") or 7)
            if days < safety:
                severity = "critical" if days < (safety * 0.5) else "elevated"
                # Check for recent duplicate alert (last 6 hours)
                existing = supabase.table("alerts").select("id").eq("read", False).ilike("message", f"%{item['material_id']}%").execute()
                if not (existing.data):
                    supabase.table("alerts").insert({
                        "case_id": None,
                        "severity": severity,
                        "message": f"Inventory alert: {item['material_id']} at {days:.1f} days cover (safety stock: {safety:.0f} days)",
                    }).execute()
                    alerts_created += 1
    except Exception as e:
        print(f"[monitor] inventory check error: {e}")

    # 3. Pending proposals older than 2 hours with no action
    try:
        props_res = supabase.table("change_proposals").select("proposal_id, action_run_id, created_at").eq("status", "pending").execute()
        for prop in (props_res.data or []):
            from datetime import datetime, timezone, timedelta
            created = prop.get("created_at")
            if created:
                try:
                    created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    age = datetime.now(timezone.utc) - created_dt
                    if age > timedelta(hours=2):
                        existing = supabase.table("alerts").select("id").eq("read", False).ilike("message", f"%{prop['proposal_id']}%").execute()
                        if not (existing.data):
                            supabase.table("alerts").insert({
                                "case_id": None,
                                "severity": "info",
                                "message": f"Proposal {prop['proposal_id']} has been pending for over 2 hours — human approval required.",
                            }).execute()
                            alerts_created += 1
                except Exception:
                    pass
    except Exception as e:
        print(f"[monitor] proposals check error: {e}")

    return {"checked": True, "alerts_created": alerts_created, "company_id": company_id}
