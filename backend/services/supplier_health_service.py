"""
Supplier Health Scoring Service.

Dynamically computes a health score (0-100) for each supplier based on:
  - Recent signal events in their region (bad = lower score)
  - Open risk cases that expose them (bad = lower score)
  - Inventory days remaining for their materials (low = lower score)
  - Purchase order delay risk (high = lower score)
  - Whether they are single-source (increases risk)

A score of 100 = perfect health, 0 = critical risk.
"""
from typing import Any, Dict, List
from backend.services.supabase_client import supabase


def compute_supplier_health(company_id: str = "ORG_DEMO") -> List[Dict[str, Any]]:
    """
    Compute health scores for all suppliers and return a list of health records.
    Also updates the suppliers table with the refreshed criticality_score.
    """
    # Fetch all data in parallel
    try:
        suppliers_res = supabase.table("suppliers").select("*").execute()
        suppliers = suppliers_res.data or []
    except Exception as e:
        return [{"error": f"Failed to fetch suppliers: {e}"}]

    try:
        signals_res = supabase.table("signal_events").select("country, confidence_score, event_type").order("created_at", desc=True).limit(100).execute()
        signals = signals_res.data or []
    except Exception:
        signals = []

    try:
        cases_res = supabase.table("risk_cases").select("exposure, scores, status").eq("status", "open").execute()
        open_cases = cases_res.data or []
    except Exception:
        open_cases = []

    try:
        inv_res = supabase.table("inventory").select("supplier_id, days_of_inventory_remaining, safety_stock_days, delay_risk").execute()
        inventory = inv_res.data or []
    except Exception:
        inventory = []

    try:
        po_res = supabase.table("purchase_orders").select("supplier_id, delay_risk").eq("status", "open").execute()
        purchase_orders = po_res.data or []
    except Exception:
        purchase_orders = []

    # Build lookup structures
    # signals by country: { country_lower: [confidence_scores] }
    signals_by_country: Dict[str, List[float]] = {}
    for sig in signals:
        c = (sig.get("country") or "").lower()
        if c:
            signals_by_country.setdefault(c, []).append(float(sig.get("confidence_score") or 0))

    # suppliers exposed in open cases: { supplier_id: max_risk_score }
    case_exposure: Dict[str, float] = {}
    for case in open_cases:
        exposed = (case.get("exposure") or {}).get("suppliers", [])
        risk_score = float((case.get("scores") or {}).get("overall", 0) or 0)
        for supp_id in exposed:
            case_exposure[supp_id] = max(case_exposure.get(supp_id, 0), risk_score)

    # inventory by supplier_id
    inv_by_supplier: Dict[str, List[Dict]] = {}
    for inv in inventory:
        sid = inv.get("supplier_id") or ""
        if sid:
            inv_by_supplier.setdefault(sid, []).append(inv)

    # PO delay risk by supplier
    po_delay_by_supplier: Dict[str, bool] = {}
    for po in purchase_orders:
        sid = po.get("supplier_id") or ""
        if sid and po.get("delay_risk"):
            po_delay_by_supplier[sid] = True

    results = []
    for supplier in suppliers:
        sid = supplier.get("supplier_id") or supplier.get("id") or ""
        country = (supplier.get("country") or "").lower()
        is_single_source = bool(supplier.get("single_source"))
        lead_time = float(supplier.get("lead_time_days") or 14)

        # ── Score components (each 0–100, higher = healthier) ──

        # 1. Regional signal risk (0–100): avg confidence of signals in country → lower is better for health
        country_signals = signals_by_country.get(country, [])
        if country_signals:
            avg_confidence = sum(country_signals) / len(country_signals)
            signal_penalty = min(40, avg_confidence * 40)  # max 40 points penalty
        else:
            signal_penalty = 0

        # 2. Open case exposure (0–100): are they in an active risk case?
        case_risk = case_exposure.get(sid, 0)
        case_penalty = min(30, case_risk * 0.3)  # max 30 points penalty

        # 3. Inventory health: days_remaining vs safety_stock
        supplier_inv = inv_by_supplier.get(sid, [])
        if supplier_inv:
            inv_scores = []
            for inv_row in supplier_inv:
                days = float(inv_row.get("days_of_inventory_remaining") or 999)
                safety = float(inv_row.get("safety_stock_days") or 7)
                ratio = days / max(safety, 1)
                inv_scores.append(min(1.0, ratio))
            avg_inv_ratio = sum(inv_scores) / len(inv_scores)
            inv_penalty = max(0, (1 - avg_inv_ratio) * 20)  # max 20 points penalty
        else:
            inv_penalty = 0

        # 4. Single-source penalty
        single_source_penalty = 5 if is_single_source else 0

        # 5. PO delay risk penalty
        po_penalty = 5 if po_delay_by_supplier.get(sid) else 0

        # Compute health score
        total_penalty = signal_penalty + case_penalty + inv_penalty + single_source_penalty + po_penalty
        health_score = max(0, min(100, round(100 - total_penalty)))

        # Determine status label
        if health_score >= 80:
            status = "healthy"
        elif health_score >= 60:
            status = "watch"
        elif health_score >= 40:
            status = "at_risk"
        else:
            status = "critical"

        record = {
            "supplier_id": sid,
            "supplier_name": supplier.get("supplier_name") or sid,
            "country": supplier.get("country") or "",
            "health_score": health_score,
            "status": status,
            "is_single_source": is_single_source,
            "lead_time_days": lead_time,
            "factors": {
                "regional_signal_penalty": round(signal_penalty, 1),
                "open_case_exposure_penalty": round(case_penalty, 1),
                "inventory_health_penalty": round(inv_penalty, 1),
                "single_source_penalty": single_source_penalty,
                "po_delay_penalty": po_penalty,
            },
            "active_signals_in_region": len(country_signals),
            "open_case_risk_score": round(case_risk, 1),
        }
        results.append(record)

        # Update criticality_score in suppliers table with inverse of health score
        try:
            new_criticality = max(0, min(100, round(100 - health_score)))
            supabase.table("suppliers").update({"criticality_score": new_criticality}).eq("supplier_id", sid).execute()
        except Exception:
            pass  # non-fatal — health report still returned

    # Sort by health score ascending (most critical first)
    results.sort(key=lambda x: x["health_score"])
    return results


def get_supplier_health_report(company_id: str = "ORG_DEMO") -> Dict[str, Any]:
    """
    Return a full health report with summary stats and per-supplier scores.
    """
    scores = compute_supplier_health(company_id)

    critical = [s for s in scores if s.get("status") == "critical"]
    at_risk = [s for s in scores if s.get("status") == "at_risk"]
    watch = [s for s in scores if s.get("status") == "watch"]
    healthy = [s for s in scores if s.get("status") == "healthy"]

    avg_score = round(sum(s.get("health_score", 0) for s in scores) / max(len(scores), 1), 1)

    return {
        "company_id": company_id,
        "total_suppliers": len(scores),
        "avg_health_score": avg_score,
        "critical_count": len(critical),
        "at_risk_count": len(at_risk),
        "watch_count": len(watch),
        "healthy_count": len(healthy),
        "suppliers": scores,
    }
