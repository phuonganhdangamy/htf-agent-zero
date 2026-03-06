import asyncio
import json
import os
import time
import uuid
from typing import Dict, Any, Optional
from backend.services.supabase_client import supabase

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


def _build_live_context(company_id: str) -> Dict[str, Any]:
    """Pull REAL data from Supabase for LLM context."""
    live = {}
    try:
        # Suppliers: criticality, single_source, country (no org_id on suppliers table)
        supp = supabase.table("suppliers").select("supplier_id, supplier_name, country, criticality_score, single_source, lead_time_days").execute()
        live["suppliers"] = supp.data or []

        # Inventory: days_of_inventory_remaining per material
        inv = supabase.table("inventory").select("material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, safety_stock_days").execute()
        live["inventory"] = inv.data or []

        # Open POs: ETAs, ship modes
        po = supabase.table("purchase_orders").select("po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk").eq("status", "open").execute()
        live["purchase_orders"] = po.data or []

        # Memory preferences: cost cap, fill rate target
        prefs = supabase.table("memory_preferences").select("*").eq("org_id", company_id).limit(1).execute()
        live["memory_preferences"] = prefs.data[0] if prefs.data else {}

        # Memory patterns for context
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


async def run_risk_assessment(company_id: str, scenario_text: str, severity: int, urgency: int) -> Dict[str, Any]:
    """Fetch live data, call Gemini, save real RiskCase to Supabase. No mock data."""
    live_context = _build_live_context(company_id)
    user_content = f"""Scenario: {scenario_text}
Severity: {severity}/100
Urgency: {urgency}/100

Live operational context:
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

    case_id = payload.get("case_id") or f"RC_{int(time.time())}_{str(uuid.uuid4())[:6].upper()}"
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
        "expected_risk_reduction": payload.get("expected_risk_reduction"),
        "expected_cost": expected_cost,
        "expected_loss_prevented": expected_loss,
        "execution_steps": payload.get("execution_steps") or [],
    }

    supabase.table("risk_cases").insert(row).execute()

    # Action run + change_proposal for approval bar (values from recommended_plan)
    action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    supabase.table("action_runs").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "status": "drafted",
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


async def run_pipeline(company_id: str, trigger: str, context: dict = None):
    """Run real LLM risk assessment; no mock data."""
    ctx = context or {}
    scenario_text = (ctx.get("scenario_text") or trigger or "").strip()
    severity = int(ctx.get("severity", 70))
    urgency = int(ctx.get("urgency", 75))
    try:
        result = await run_risk_assessment(company_id, scenario_text, severity, urgency)
        return result
    except Exception as e:
        print(f"Error in run_risk_assessment: {e}")
        return {"status": "error", "message": str(e)}


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
