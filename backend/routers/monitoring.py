"""Monitoring router — exposes endpoints for alert checks."""
from fastapi import APIRouter
from typing import Optional
from backend.services.supabase_client import supabase
from backend.services.monitoring_service import check_and_alert

router = APIRouter()


@router.post("/check")
def run_monitoring_check(company_id: Optional[str] = "ORG_DEMO"):
    """Manually trigger a monitoring check. Returns alerts created."""
    return check_and_alert(company_id=company_id)


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
