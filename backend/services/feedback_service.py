"""
Memory & Feedback Learning Service.

Records case outcomes, extracts lessons from plan iterations,
and stores reusable patterns in the memory_patterns table so future
risk assessments can learn from past decisions.
"""
import json
import time
from typing import Any, Dict, List, Optional
from backend.services.supabase_client import supabase


def record_case_outcome(
    case_id: str,
    outcome: str,  # "resolved", "failed", "partially_resolved", "abandoned"
    actual_impact_usd: Optional[float] = None,
    notes: str = "",
    actor: str = "Administrator",
) -> Dict[str, Any]:
    """
    Mark a risk case as resolved and record the real-world outcome.
    Extracts lessons and saves them to memory_patterns for future learning.
    """
    res = supabase.table("risk_cases").select("*").eq("case_id", case_id).execute()
    if not res.data:
        raise ValueError(f"Risk case not found: {case_id}")
    case = res.data[0]

    # Update the case status
    new_status = "resolved" if outcome in ("resolved", "partially_resolved") else "abandoned"
    supabase.table("risk_cases").update({
        "status": new_status,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }).eq("case_id", case_id).execute()

    # Write audit log
    supabase.table("audit_log").insert({
        "case_id": case_id,
        "actor": actor,
        "event_type": "case_outcome_recorded",
        "payload": {
            "outcome": outcome,
            "actual_impact_usd": actual_impact_usd,
            "notes": notes,
        },
    }).execute()

    # Extract and store learnable patterns
    patterns_saved = _extract_and_store_patterns(case, outcome, actual_impact_usd, notes)

    return {
        "status": "ok",
        "case_id": case_id,
        "outcome": outcome,
        "patterns_saved": patterns_saved,
    }


def _extract_and_store_patterns(
    case: Dict[str, Any],
    outcome: str,
    actual_impact_usd: Optional[float],
    notes: str,
) -> int:
    """
    Derive reusable patterns from a closed case and save them to memory_patterns.
    Returns number of patterns saved.
    """
    saved = 0
    case_id = case.get("case_id", "")
    risk_category = case.get("risk_category", "")
    scores = case.get("scores") or {}
    exposure = case.get("exposure") or {}
    plan_iterations = case.get("plan_iterations") or []

    recommended_plan = case.get("recommended_plan")
    if isinstance(recommended_plan, str):
        try:
            recommended_plan = json.loads(recommended_plan) if recommended_plan.strip().startswith("{") else {}
        except Exception:
            recommended_plan = {}

    # Pattern 1: Outcome pattern — which plan type succeeded or failed for this risk category
    if recommended_plan and isinstance(recommended_plan, dict):
        plan_name = recommended_plan.get("name", "")
        plan_cost = recommended_plan.get("expected_cost_usd")
        plan_loss_prevented = recommended_plan.get("expected_loss_prevented_usd")
        estimated_accuracy = None
        if plan_loss_prevented and actual_impact_usd is not None:
            # How accurate was our loss prevention estimate?
            estimated_accuracy = round(
                min(1.0, actual_impact_usd / plan_loss_prevented) if plan_loss_prevented > 0 else 0.0,
                2,
            )

        try:
            supabase.table("memory_patterns").insert({
                "pattern_type": "plan_outcome",
                "pattern_data": {
                    "source_case_id": case_id,
                    "risk_category": risk_category,
                    "plan_name": plan_name,
                    "outcome": outcome,
                    "plan_cost_usd": plan_cost,
                    "estimated_loss_prevented_usd": plan_loss_prevented,
                    "actual_impact_usd": actual_impact_usd,
                    "estimation_accuracy": estimated_accuracy,
                    "risk_score": scores.get("overall"),
                    "notes": notes,
                },
            }).execute()
            saved += 1
        except Exception as e:
            print(f"[feedback] Failed to save plan_outcome pattern: {e}")

    # Pattern 2: Rejection pattern — what action types users consistently reject
    for iteration in plan_iterations:
        rejection_reason = iteration.get("rejected_reason", "")
        rejected_plan = iteration.get("plan") or {}
        if isinstance(rejected_plan, str):
            try:
                rejected_plan = json.loads(rejected_plan)
            except Exception:
                rejected_plan = {}
        rejected_actions = rejected_plan.get("actions", []) if isinstance(rejected_plan, dict) else []
        if rejection_reason and rejection_reason != "No reason given":
            try:
                supabase.table("memory_patterns").insert({
                    "pattern_type": "rejection_reason",
                    "pattern_data": {
                        "source_case_id": case_id,
                        "risk_category": risk_category,
                        "rejection_reason": rejection_reason,
                        "rejected_actions": rejected_actions,
                        "actor": iteration.get("actor", "Administrator"),
                    },
                }).execute()
                saved += 1
            except Exception as e:
                print(f"[feedback] Failed to save rejection_reason pattern: {e}")

    # Pattern 3: Exposure pattern — which supplier/region combos frequently appear in cases
    exposed_suppliers = exposure.get("suppliers", [])
    if exposed_suppliers and risk_category:
        try:
            supabase.table("memory_patterns").insert({
                "pattern_type": "exposure_hotspot",
                "pattern_data": {
                    "source_case_id": case_id,
                    "risk_category": risk_category,
                    "exposed_suppliers": exposed_suppliers,
                    "inventory_days_cover": exposure.get("inventory_days_cover"),
                    "outcome": outcome,
                    "overall_score": scores.get("overall"),
                },
            }).execute()
            saved += 1
        except Exception as e:
            print(f"[feedback] Failed to save exposure_hotspot pattern: {e}")

    return saved


def get_memory_summary(company_id: str = "ORG_DEMO") -> Dict[str, Any]:
    """
    Return a human-readable summary of all learned patterns for a company.
    Used by the frontend Memory page and injected into the LLM prompt context.
    """
    try:
        res = supabase.table("memory_patterns").select("*").order("created_at", desc=True).limit(50).execute()
        patterns = res.data or []
    except Exception as e:
        return {"error": str(e), "patterns": [], "summary": {}}

    outcome_patterns = [p for p in patterns if p.get("pattern_type") == "plan_outcome"]
    rejection_patterns = [p for p in patterns if p.get("pattern_type") == "rejection_reason"]
    hotspot_patterns = [p for p in patterns if p.get("pattern_type") == "exposure_hotspot"]

    # Build summary stats
    resolved_plans = [p for p in outcome_patterns if (p.get("pattern_data") or {}).get("outcome") in ("resolved", "partially_resolved")]
    failed_plans = [p for p in outcome_patterns if (p.get("pattern_data") or {}).get("outcome") in ("failed", "abandoned")]

    # Most common rejection reasons
    rejection_counts: Dict[str, int] = {}
    for p in rejection_patterns:
        reason = (p.get("pattern_data") or {}).get("rejection_reason", "Unknown")
        rejection_counts[reason] = rejection_counts.get(reason, 0) + 1

    # Most frequent exposure hotspots
    hotspot_counts: Dict[str, int] = {}
    for p in hotspot_patterns:
        for supp in (p.get("pattern_data") or {}).get("exposed_suppliers", []):
            hotspot_counts[supp] = hotspot_counts.get(supp, 0) + 1

    top_rejections = sorted(rejection_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    top_hotspots = sorted(hotspot_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "total_patterns": len(patterns),
        "plans_with_outcomes": len(outcome_patterns),
        "successful_resolutions": len(resolved_plans),
        "failed_resolutions": len(failed_plans),
        "top_rejection_reasons": [{"reason": r, "count": c} for r, c in top_rejections],
        "top_exposure_hotspots": [{"supplier_id": s, "frequency": f} for s, f in top_hotspots],
        "patterns": patterns,
    }


def build_memory_context_for_prompt(company_id: str = "ORG_DEMO") -> str:
    """
    Build a concise text block to inject into the Gemini system prompt
    so the model benefits from past learnings.
    """
    summary = get_memory_summary(company_id)
    lines = ["PAST LEARNINGS (use to improve recommendations):"]

    top_rejections = summary.get("top_rejection_reasons", [])
    if top_rejections:
        lines.append("Users frequently rejected plans for these reasons — AVOID repeating:")
        for item in top_rejections:
            lines.append(f"  • {item['reason']} (rejected {item['count']}x)")

    top_hotspots = summary.get("top_exposure_hotspots", [])
    if top_hotspots:
        lines.append("Suppliers most frequently exposed in past risk cases — flag these proactively:")
        for item in top_hotspots:
            lines.append(f"  • {item['supplier_id']} (appeared {item['frequency']}x)")

    success_count = summary.get("successful_resolutions", 0)
    fail_count = summary.get("failed_resolutions", 0)
    if success_count + fail_count > 0:
        lines.append(f"Historical plan success rate: {success_count}/{success_count + fail_count} cases resolved.")

    return "\n".join(lines) if len(lines) > 1 else ""
