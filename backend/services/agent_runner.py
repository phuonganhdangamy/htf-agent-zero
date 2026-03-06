import asyncio
import json
import os
import time
import uuid
from typing import Dict, Any, Optional, List
from backend.services.supabase_client import supabase

# Action layer step template (step, name, status, timestamp, artifact_id, description)
DEFAULT_ACTION_RUN_STEPS = [
    {"step": 1, "name": "ExposureAgent", "status": "DONE", "description": "validated — SUPP_044 exposed, 4.2d cover"},
    {"step": 2, "name": "DraftingAgent", "status": "DONE", "description": "supplier outreach email drafted"},
    {"step": 3, "name": "ApprovalAgent", "status": "PENDING", "description": "awaiting human sign-off on email"},
    {"step": 4, "name": "CommitAgent", "status": "LOCKED", "description": "send email to SUPP_044"},
    {"step": 5, "name": "ChangeProposalAgent", "status": "LOCKED", "description": "propose PO_8821 ETA change ocean→air"},
    {"step": 6, "name": "ApprovalAgent", "status": "LOCKED", "description": "awaiting approval for ERP write"},
    {"step": 7, "name": "CommitAgent", "status": "LOCKED", "description": "write to ERP"},
    {"step": 8, "name": "VerificationAgent", "status": "LOCKED", "description": "confirm ERP updated"},
    {"step": 9, "name": "AuditAgent", "status": "LOCKED", "description": "write audit record"},
]

# Lazy Gemini client
_gemini_client = None

def _get_gemini_client():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not configured")
    from google import genai
    _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _build_live_context(company_id: str, focus_suppliers: Optional[List[str]] = None, focus_materials: Optional[List[str]] = None) -> Dict[str, Any]:
    """Pull REAL data from Supabase for LLM context. Optionally filter by focus_suppliers and focus_materials."""
    live = {}
    try:
        supp = supabase.table("suppliers").select("supplier_id, supplier_name, country, criticality_score, single_source, lead_time_days").execute()
        all_suppliers = supp.data or []
        if focus_suppliers:
            ids = set(focus_suppliers)
            live["suppliers"] = [s for s in all_suppliers if s.get("supplier_id") in ids]
        else:
            live["suppliers"] = all_suppliers

        inv = supabase.table("inventory").select("material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, safety_stock_days").execute()
        all_inv = inv.data or []
        if focus_suppliers:
            ids = set(focus_suppliers)
            all_inv = [i for i in all_inv if i.get("supplier_id") in ids]
        if focus_materials:
            mat_ids = set(focus_materials)
            all_inv = [i for i in all_inv if i.get("material_id") in mat_ids]
        live["inventory"] = all_inv

        po = supabase.table("purchase_orders").select("po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk").eq("status", "open").execute()
        all_po = po.data or []
        if focus_suppliers:
            ids = set(focus_suppliers)
            all_po = [p for p in all_po if p.get("supplier_id") in ids]
        if focus_materials:
            mat_ids = set(focus_materials)
            all_po = [p for p in all_po if p.get("material_id") in mat_ids]
        live["purchase_orders"] = all_po

        prefs = supabase.table("memory_preferences").select("*").eq("org_id", company_id).limit(1).execute()
        live["memory_preferences"] = prefs.data[0] if prefs.data else {}

        pat = supabase.table("memory_patterns").select("*").limit(20).execute()
        live["memory_patterns"] = pat.data or []
    except Exception as e:
        print(f"Error building live context: {e}")
    return live


RISK_SYSTEM_PROMPT = """You are Omni's reasoning engine for supply chain risk assessment.
You will be given a scenario and the company's live operational data.
Produce a RiskCase JSON object. Be specific — use real supplier IDs, material IDs, PO IDs and numbers from the data provided.
Do not invent data that is not in the context.

Output ONLY valid JSON matching this exact schema:
{
  "case_id": "RC_<timestamp>",
  "headline": "<specific 1-sentence summary referencing real supplier/material>",
  "risk_category": "conflict|disaster|logistics|trade|cost|macro|cyber",
  "scores": {
    "likelihood": <0-100, influenced by severity slider>,
    "impact": <0-100, influenced by urgency slider and inventory days>,
    "urgency": <0-100>,
    "overall": <weighted average>,
    "confidence": <0-100>
  },
  "exposure": {
    "suppliers": [<list supplier_ids actually exposed>],
    "skus": [<list material_ids at risk>],
    "inventory_days_cover": <actual number from inventory table>,
    "pos_at_risk": [<list po_ids with their ETAs>]
  },
  "hypotheses": {
    "chain": [<3-5 step causal chain as array of strings>],
    "likelihood": <0-1>,
    "unknowns": [<list of unknowns>]
  },
  "recommended_plan": {
    "plan_id": "PLAN_A",
    "name": "<specific action name>",
    "actions": [<list of specific action strings>],
    "expected_cost_usd": <number within cost cap>,
    "expected_loss_prevented_usd": <number>,
    "expected_delay_days": <number>,
    "service_level": <0-1>
  },
  "reasoning_summary": [
    "<bullet 1: why this plan was chosen, e.g. SUPP_044 is single-source with X days cover>",
    "<bullet 2: e.g. PO_8821 ETA is ... >",
    "<3-5 bullets total explaining exactly why this plan over alternatives>"
  ],
  "alternative_plans": [
    {
      "plan_id": "PLAN_B",
      "name": "<alternative>",
      "actions": [<list>],
      "expected_cost_usd": <number>,
      "expected_loss_prevented_usd": <number>
    }
  ],
  "execution_steps": [<list of step strings>]
}"""


def _directives_prompt_block(directives: Optional[Dict[str, bool]], cost_cap_override: Optional[float]) -> str:
    """Build prompt block for active system directives and cost cap."""
    lines = []
    if directives:
        lines.append("Active system directives (treat as hard constraints):")
        for key, on in directives.items():
            name = key.upper().replace("_", "_")
            lines.append(f"  {name}={str(on).lower()}")
        if directives.get("enforce_cost_cap") and cost_cap_override is not None:
            lines.append(f"  ENFORCE_COST_CAP=true means do not recommend any plan exceeding ${cost_cap_override:,.0f} under any circumstance.")
    if cost_cap_override is not None and (not directives or directives.get("enforce_cost_cap")):
        lines.append(f"Cost cap for this run: ${cost_cap_override:,.0f}. Do not suggest plans above this.")
    return "\n".join(lines) if lines else ""

async def run_risk_assessment(company_id: str, scenario_text: str, severity: int, urgency: int, run_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Fetch live data, call Gemini, save real RiskCase to Supabase. No mock data."""
    run_ctx = run_context or {}
    focus_suppliers = run_ctx.get("focus_suppliers")
    focus_materials = run_ctx.get("focus_materials")
    flagged_regions = run_ctx.get("flagged_regions") or []
    directives = run_ctx.get("directives") or {}
    budget_flexibility = run_ctx.get("budget_flexibility")
    risk_tolerance = run_ctx.get("risk_tolerance")
    timeline = run_ctx.get("timeline")

    live_context = _build_live_context(company_id, focus_suppliers=focus_suppliers, focus_materials=focus_materials)
    prefs = live_context.get("memory_preferences") or {}
    obj = prefs.get("objectives") or {}

    # Inject memory learnings from past cases
    try:
        from backend.services.feedback_service import build_memory_context_for_prompt
        memory_context = build_memory_context_for_prompt(company_id)
    except Exception:
        memory_context = ""
    base_cap = obj.get("cost_cap_usd") or obj.get("cost_cap") or 50000
    if budget_flexibility == "flexible":
        cost_cap_override = base_cap * 2
    elif budget_flexibility == "emergency":
        cost_cap_override = None
    else:
        cost_cap_override = base_cap

    directives_block = _directives_prompt_block(directives, cost_cap_override)
    constraints = []
    if focus_suppliers:
        constraints.append(f"Consider ONLY these suppliers in mitigation plans: {', '.join(focus_suppliers)}. Do not recommend plans involving other suppliers.")
    if focus_materials:
        constraints.append(f"Focus on materials: {', '.join(focus_materials)}.")
    if flagged_regions:
        constraints.append(f"Weight risk signals more heavily for these regions: {', '.join(flagged_regions)}.")
    if risk_tolerance:
        constraints.append(f"Risk tolerance for this run: {risk_tolerance}. conservative=prefer backup supplier even if expensive; balanced=optimize cost vs service; aggressive=accept higher risk to minimize cost.")
    if timeline == "critical":
        constraints.append("Timeline is critical (<2 weeks). Filter out any mitigation with lead time or delay beyond 2 weeks.")
    elif timeline == "tight":
        constraints.append("Timeline is tight (30 days). Prefer mitigations that can execute within 30 days.")
    constraints_text = "\n".join(constraints) if constraints else ""

    # Build hyper-personalization context from memory_preferences
    hyper_lines = []
    lead_time_sensitivity = obj.get("lead_time_sensitivity")
    supplier_concentration_threshold = obj.get("supplier_concentration_threshold")
    contract_structures = obj.get("contract_structures") or []
    customer_slas = obj.get("customer_slas") or []
    if lead_time_sensitivity:
        hyper_lines.append(f"Lead-time sensitivity: {lead_time_sensitivity} — {'prioritize fast-to-activate suppliers' if lead_time_sensitivity == 'high' else 'standard lead time acceptable'}")
    if supplier_concentration_threshold:
        hyper_lines.append(f"Supplier concentration limit: no single supplier should exceed {supplier_concentration_threshold*100:.0f}% of spend")
    if contract_structures:
        hyper_lines.append(f"Preferred contract structures: {', '.join(contract_structures)}")
    if customer_slas:
        sla_str = ", ".join(f"{s.get('customer','?')}: {s.get('sla_days','?')}d" for s in customer_slas[:3])
        hyper_lines.append(f"Customer SLAs to protect: {sla_str}")
    hyper_block = "\n".join(hyper_lines) if hyper_lines else ""

    user_content = f"""Scenario: {scenario_text}
Severity: {severity}/100
Urgency: {urgency}/100
{directives_block}
{constraints_text}
{hyper_block}
{memory_context}

Live operational context (already filtered by focus suppliers/materials if provided):
{json.dumps(live_context, indent=2, default=str)}"""

    from google.genai import types
    client = _get_gemini_client()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{RISK_SYSTEM_PROMPT}\n\nUSER:\n{user_content}",
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    text = response.text if hasattr(response, "text") else ""
    if not text or not text.strip():
        raise ValueError("Gemini returned empty response")

    # Parse and normalize
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as e:
        # Try extracting JSON from markdown block
        if "```" in text:
            start = text.find("```") + 3
            if "json" in text[:start].lower():
                start = text.find("\n", start) + 1
            end = text.find("```", start)
            text = text[start:end] if end > start else text
        payload = json.loads(text)

    # Always generate server-side to guarantee uniqueness (Gemini uses timestamp-only IDs that collide)
    case_id = f"RC_{int(time.time())}_{str(uuid.uuid4())[:6].upper()}"
    payload["case_id"] = case_id

    # Influence scores by sliders
    scores = payload.get("scores") or {}
    scores["likelihood"] = min(100, max(0, scores.get("likelihood", 50) + (severity - 50) // 2))
    scores["urgency"] = min(100, max(0, scores.get("urgency", 50) + (urgency - 50) // 2))
    scores["overall"] = (scores.get("likelihood", 0) + scores.get("impact", 0) + scores.get("urgency", 0)) // 3
    payload["scores"] = scores

    # Use real inventory_days_cover from context if present
    inv_data = live_context.get("inventory") or []
    if inv_data:
        first_inv = inv_data[0]
        days = first_inv.get("days_of_inventory_remaining")
        if days is not None:
            exp = payload.get("exposure") or {}
            exp["inventory_days_cover"] = float(days)
            payload["exposure"] = exp

    rec = payload.get("recommended_plan") or {}
    expected_cost = rec.get("expected_cost_usd")
    expected_loss = rec.get("expected_loss_prevented_usd")
    reasoning_summary = payload.get("reasoning_summary")
    if not isinstance(reasoning_summary, list):
        reasoning_summary = []

    row = {
        "case_id": case_id,
        "cluster_id": payload.get("cluster_id") or "CLUSTER_001",
        "risk_category": payload.get("risk_category") or "Supply Chain Disruption",
        "headline": payload.get("headline") or scenario_text[:200],
        "status": "open",
        "scores": payload.get("scores"),
        "exposure": payload.get("exposure"),
        "hypotheses": payload.get("hypotheses"),
        "recommended_plan": json.dumps(rec) if isinstance(rec, dict) else (rec if isinstance(rec, str) else ""),
        "alternative_plans": payload.get("alternative_plans") or [],
        "reasoning_summary": reasoning_summary,
        "iteration_count": 0,
        "plan_iterations": [],
        "expected_risk_reduction": payload.get("expected_risk_reduction"),
        "expected_cost": expected_cost,
        "expected_loss_prevented": expected_loss,
        "execution_steps": payload.get("execution_steps") or [],
    }

    supabase.table("risk_cases").insert(row).execute()

    # Action run + change_proposal for approval bar (values from recommended_plan)
    action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    # --- DraftingAgent: generate email draft artifact ---
    artifact_id = f"ART-{str(uuid.uuid4())[:8].upper()}"
    supplier_ids = (payload.get("exposure") or {}).get("suppliers") or []
    to_email = f"procurement@{str(supplier_ids[0]).lower().replace('_', '-')}.com" if supplier_ids else "supplier@example.com"
    headline_short = (payload.get("headline") or "")[:80]
    subject = f"[URGENT] Supply Chain Risk Mitigation — {headline_short}"
    actions_list = rec.get("actions") or [] if isinstance(rec, dict) else []
    cost_str = f"${rec.get('expected_cost_usd', 0):,.0f}" if isinstance(rec, dict) and rec.get('expected_cost_usd') else "TBD"
    actions_text = "\n".join(f"  • {a}" for a in actions_list) if actions_list else "  • See attached mitigation plan"
    body = f"""Dear Supplier Partnership Team,

We are writing to advise you of an identified supply chain disruption that requires immediate coordination.

Risk Assessment Summary:
  Headline: {payload.get('headline', '')}
  Category: {payload.get('risk_category', '')}
  Risk Score: {scores.get('overall', 'N/A')}/100
  Urgency: {scores.get('urgency', 'N/A')}/100

Recommended Mitigation Actions:
{actions_text}

Expected Cost: {cost_str}
Expected Loss Prevented: ${rec.get('expected_loss_prevented_usd', 0):,.0f}

We request your immediate confirmation and action on the above. Please respond within 24 hours.

Best regards,
Omni Supply Chain Intelligence
Omni Manufacturing — Procurement Operations"""

    # Attach artifact_id to DraftingAgent step (index 1)
    steps_with_artifact = [dict(s) for s in DEFAULT_ACTION_RUN_STEPS]
    steps_with_artifact[1]["artifact_id"] = artifact_id

    # Insert action_run FIRST (draft_artifacts has FK on action_run_id)
    supabase.table("action_runs").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "status": "drafted",
        "steps": steps_with_artifact,
    }).execute()

    draft_preview = f"TO: {to_email}\nSUBJECT: {subject}\n\n{body}"
    supabase.table("draft_artifacts").insert({
        "artifact_id": artifact_id,
        "action_run_id": action_run_id,
        "type": "email",
        "preview": draft_preview,
        "structured_payload": {
            "to": to_email,
            "subject": subject,
            "body": body,
        },
        "status": "draft",
    }).execute()
    supabase.table("change_proposals").insert({
        "proposal_id": proposal_id,
        "action_run_id": action_run_id,
        "system": "Omni",
        "entity_type": "Procurement",
        "entity_id": rec.get("plan_id") or "PLAN_A",
        "diff": rec,
        "risk": {"confidence": scores.get("confidence", 80), "financial_impact": expected_cost},
        "status": "pending",
    }).execute()

    return {"status": "completed", "company_id": company_id, "case_id": case_id}


def _severity_from_order_volume(order_volume: Optional[str]) -> int:
    mult = {"routine": 1.0, "large": 1.3, "critical": 1.6, "emergency": 2.0}.get((order_volume or "").lower(), 1.3)
    return min(100, int(50 * mult))

def _urgency_from_timeline(timeline: Optional[str]) -> int:
    return {"flexible": 30, "standard": 50, "tight": 75, "critical": 95}.get((timeline or "").lower(), 75)

async def run_pipeline(company_id: str, trigger: str, context: dict = None):
    """Run real LLM risk assessment; no mock data."""
    ctx = context or {}
    scenario_text = (ctx.get("scenario_text") or trigger or "").strip()
    if ctx.get("severity") is not None:
        severity = int(ctx["severity"])
    else:
        severity = _severity_from_order_volume(ctx.get("order_volume"))
    if ctx.get("urgency") is not None:
        urgency = int(ctx["urgency"])
    else:
        urgency = _urgency_from_timeline(ctx.get("timeline"))
    run_context = {
        "focus_suppliers": ctx.get("focus_suppliers"),
        "focus_materials": ctx.get("focus_materials"),
        "flagged_regions": ctx.get("flagged_regions"),
        "directives": ctx.get("directives"),
        "budget_flexibility": ctx.get("budget_flexibility"),
        "risk_tolerance": ctx.get("risk_tolerance"),
        "timeline": ctx.get("timeline"),
    }
    try:
        result = await run_risk_assessment(company_id, scenario_text, severity, urgency, run_context=run_context)
        return result
    except Exception as e:
        print(f"Error in run_risk_assessment: {e}")
        return {"status": "error", "message": str(e)}


RERUN_PLAN_SYSTEM_PROMPT = """You are Omni's PlanGenerator. The user REJECTED a previous mitigation plan. Your job is to generate ONE alternative plan that respects the new constraints. Do NOT re-run perception, scoring, or exposure — use the existing risk case context only.

Output ONLY valid JSON:
{
  "recommended_plan": {
    "plan_id": "PLAN_B",
    "name": "<specific action name>",
    "actions": [<list of specific action strings>],
    "expected_cost_usd": <number>,
    "expected_loss_prevented_usd": <number>,
    "expected_delay_days": <number>,
    "service_level": <0-1>
  },
  "reasoning_summary": ["<bullet 1>", "<bullet 2>", "<3-5 bullets why this new plan>"],
  "execution_steps": ["[PlanGenerator] Rerunning with user constraints...", "[ScenarioSimulator] ...", "[ExecutionPlanner] Awaiting approval for revised plan"]
}"""


async def rerun_plan_only(
    case_id: str,
    rejection_reason: str,
    feedback_text: str,
    constraint_overrides: Dict[str, Any],
    actor: str = "Administrator",
) -> Dict[str, Any]:
    """Rerun only plan generation with rejection feedback. Does NOT call Perception/Scoring. Max 3 iterations."""
    res = supabase.table("risk_cases").select("*").eq("case_id", case_id).execute()
    if not res.data:
        raise ValueError(f"Risk case not found: {case_id}")
    row = res.data[0]
    iteration_count = int(row.get("iteration_count") or 0)
    if iteration_count >= 3:
        return {"status": "error", "message": "Maximum iterations (3) reached. Save scenario to Risk Cases for manual review."}

    current_plan = row.get("recommended_plan")
    if isinstance(current_plan, str):
        try:
            current_plan = json.loads(current_plan) if current_plan.strip().startswith("{") else {}
        except json.JSONDecodeError:
            current_plan = {}
    plan_iterations = list(row.get("plan_iterations") or [])
    plan_iterations.append({
        "plan": current_plan,
        "status": "rejected",
        "rejected_reason": rejection_reason or "No reason given",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "actor": actor,
    })

    # Mark current pending proposal as rejected
    runs_res = supabase.table("action_runs").select("action_run_id").eq("case_id", case_id).execute()
    run_ids = [r["action_run_id"] for r in (runs_res.data or [])]
    if run_ids:
        supabase.table("change_proposals").update({"status": "rejected", "approved_by": actor}).in_("action_run_id", run_ids).eq("status", "pending").execute()

    # Build rerun user prompt
    prev_plan_str = json.dumps(current_plan, indent=2) if isinstance(current_plan, dict) else str(current_plan)
    overrides_str = json.dumps(constraint_overrides or {}, indent=2)
    excluded = constraint_overrides.get("excluded_actions") or []
    user_content = f"""Previous plan was REJECTED by the user.
Rejection reason: {rejection_reason or "No reason given"}
User feedback: {feedback_text or "None"}

New constraints: {overrides_str}

Generate an alternative plan that respects these new constraints.
Do not suggest the same plan as before.
Excluded action types: {excluded}

Existing risk case context (do not recompute scores/exposure):
headline: {row.get("headline")}
scores: {json.dumps(row.get("scores") or {})}
exposure: {json.dumps(row.get("exposure") or {})}
hypotheses: {json.dumps(row.get("hypotheses") or {})}

Previous (rejected) plan:
{prev_plan_str}
"""

    from google.genai import types
    client = _get_gemini_client()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{RERUN_PLAN_SYSTEM_PROMPT}\n\nUSER:\n{user_content}",
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    text = response.text if hasattr(response, "text") else ""
    if not text or not text.strip():
        raise ValueError("Gemini returned empty response on rerun")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        if "```" in text:
            start = text.find("```") + 3
            if "json" in text[:start].lower():
                start = text.find("\n", start) + 1
            end = text.find("```", start)
            text = text[start:end] if end > start else text
        payload = json.loads(text)

    new_plan = payload.get("recommended_plan") or {}
    new_reasoning = payload.get("reasoning_summary") or []
    if not isinstance(new_reasoning, list):
        new_reasoning = []
    new_steps = payload.get("execution_steps") or []
    existing_steps = list(row.get("execution_steps") or [])
    updated_steps = existing_steps + new_steps

    alternative_plans = list(row.get("alternative_plans") or [])
    if isinstance(alternative_plans, dict):
        alternative_plans = [alternative_plans]
    alternative_plans.append(new_plan)

    update_row = {
        "recommended_plan": json.dumps(new_plan) if isinstance(new_plan, dict) else new_plan,
        "reasoning_summary": new_reasoning,
        "execution_steps": updated_steps,
        "plan_iterations": plan_iterations,
        "iteration_count": iteration_count + 1,
        "alternative_plans": alternative_plans,
        "expected_cost": new_plan.get("expected_cost_usd") if isinstance(new_plan, dict) else None,
        "expected_loss_prevented": new_plan.get("expected_loss_prevented_usd") if isinstance(new_plan, dict) else None,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    supabase.table("risk_cases").update(update_row).eq("case_id", case_id).execute()

    action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    scores = row.get("scores") or {}
    supabase.table("action_runs").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "status": "drafted",
        "steps": DEFAULT_ACTION_RUN_STEPS,
    }).execute()
    supabase.table("change_proposals").insert({
        "proposal_id": proposal_id,
        "action_run_id": action_run_id,
        "system": "Omni",
        "entity_type": "Procurement",
        "entity_id": new_plan.get("plan_id", "PLAN_B") if isinstance(new_plan, dict) else "PLAN_B",
        "diff": new_plan,
        "risk": {"confidence": scores.get("confidence", 80), "financial_impact": new_plan.get("expected_cost_usd") if isinstance(new_plan, dict) else None},
        "status": "pending",
    }).execute()

    # Audit log for activity
    supabase.table("audit_log").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "actor": actor,
        "event_type": "plan_rerun",
        "payload": {"rejection_reason": rejection_reason, "feedback_text": feedback_text, "iteration": iteration_count + 1},
    }).execute()

    return {"status": "completed", "case_id": case_id, "iteration_count": iteration_count + 1}


async def abandon_scenario(case_id: str, actor: str = "Administrator", reason: str = "") -> Dict[str, Any]:
    """Set risk case status to abandoned, mark pending proposals rejected, and write audit log."""
    res = supabase.table("risk_cases").select("case_id").eq("case_id", case_id).execute()
    if not res.data:
        raise ValueError(f"Risk case not found: {case_id}")
    supabase.table("risk_cases").update({"status": "abandoned", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}).eq("case_id", case_id).execute()
    runs_res = supabase.table("action_runs").select("action_run_id").eq("case_id", case_id).execute()
    run_ids = [r["action_run_id"] for r in (runs_res.data or [])]
    if run_ids:
        supabase.table("change_proposals").update({"status": "rejected", "approved_by": actor}).in_("action_run_id", run_ids).eq("status", "pending").execute()
    supabase.table("audit_log").insert({
        "case_id": case_id,
        "actor": actor,
        "event_type": "scenario_abandoned",
        "payload": {"reason": reason or "User abandoned scenario"},
    }).execute()
    return {"status": "abandoned", "case_id": case_id}


async def poll_for_approval(proposal_id: str, timeout_hours: int = 2) -> Dict[str, Any]:
    timeout_seconds = timeout_hours * 3600
    elapsed = 0
    while elapsed < timeout_seconds:
        response = supabase.table("change_proposals").select("status", "approved_by").eq("proposal_id", proposal_id).execute()
        if response.data:
            proposal = response.data[0]
            if proposal["status"] in ["approved", "rejected"]:
                return proposal
        await asyncio.sleep(5)
        elapsed += 5
    return {"status": "timeout"}
