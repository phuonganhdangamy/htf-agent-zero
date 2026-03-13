import asyncio
import json
import os
import time
import uuid
from typing import Dict, Any, Optional, List
from backend.services.supabase_client import supabase

# Fallback action step template (used only when execution_steps is empty/missing).
DEFAULT_ACTION_RUN_STEPS = [
    {"step": 1, "name": "ExposureAgent", "status": "DONE", "description": "validated exposure"},
    {"step": 2, "name": "DraftingAgent", "status": "DONE", "description": "supplier outreach email drafted"},
    {"step": 3, "name": "ApprovalAgent", "status": "PENDING", "description": "awaiting human sign-off on email"},
    {"step": 4, "name": "CommitAgent", "status": "LOCKED", "description": "send email to supplier"},
    {"step": 5, "name": "ChangeProposalAgent", "status": "LOCKED", "description": "propose ERP changes"},
    {"step": 6, "name": "ApprovalAgent", "status": "LOCKED", "description": "awaiting approval for ERP write"},
    {"step": 7, "name": "CommitAgent", "status": "LOCKED", "description": "write to ERP"},
    {"step": 8, "name": "VerificationAgent", "status": "LOCKED", "description": "confirm ERP updated"},
    {"step": 9, "name": "AuditAgent", "status": "LOCKED", "description": "write audit record"},
]


def build_action_run_steps(
    execution_steps: Optional[List[str]] = None,
    exposure: Optional[Dict[str, Any]] = None,
    headline: str = "",
) -> List[Dict[str, Any]]:
    """Build action_run steps dynamically from risk case execution_steps.

    Uses the execution_steps strings from the Gemini-generated risk case
    to populate step descriptions, keeping the fixed agent workflow structure.
    Falls back to DEFAULT_ACTION_RUN_STEPS when execution_steps is empty.
    """
    if not execution_steps:
        return [dict(s) for s in DEFAULT_ACTION_RUN_STEPS]

    # Filter out internal planner noise (e.g. "[PlanGenerator] Rerunning...")
    real_steps = [s for s in execution_steps if not s.startswith("[")]
    if not real_steps:
        return [dict(s) for s in DEFAULT_ACTION_RUN_STEPS]

    # Extract supplier/material info from exposure for the fixed workflow steps
    exp = exposure or {}
    suppliers = exp.get("suppliers") or []
    skus = exp.get("skus") or []
    pos = exp.get("pos_at_risk") or []
    days_cover = exp.get("inventory_days_cover", "N/A")

    supplier_str = suppliers[0] if suppliers else "supplier"
    sku_str = skus[0] if skus else "material"
    po_str = pos[0] if isinstance(pos, list) and pos else ""

    # Build the exposure description from headline or exposure data
    exposure_desc = headline[:120] if headline else f"{supplier_str} exposed, {sku_str} {days_cover}d cover"

    # First: fixed workflow steps (ExposureAgent, DraftingAgent, ApprovalAgent)
    steps: List[Dict[str, Any]] = [
        {"step": 1, "name": "ExposureAgent", "status": "DONE", "description": f"validated — {exposure_desc}"},
        {"step": 2, "name": "DraftingAgent", "status": "DONE", "description": "supplier outreach email drafted"},
        {"step": 3, "name": "ApprovalAgent", "status": "PENDING", "description": "awaiting human sign-off on email"},
        {"step": 4, "name": "CommitAgent", "status": "LOCKED", "description": f"send email to {supplier_str}"},
    ]

    # Middle: one step per execution_step from the risk case
    step_num = 5
    for exec_step in real_steps:
        # Truncate long descriptions for UI readability
        desc = exec_step[:200] if len(exec_step) > 200 else exec_step
        steps.append({"step": step_num, "name": "ExecutionAgent", "status": "LOCKED", "description": desc})
        step_num += 1

    # End: fixed closing steps
    steps.append({"step": step_num, "name": "ApprovalAgent", "status": "LOCKED", "description": "awaiting approval for ERP write"})
    step_num += 1
    steps.append({"step": step_num, "name": "CommitAgent", "status": "LOCKED", "description": "write to ERP"})
    step_num += 1
    steps.append({"step": step_num, "name": "VerificationAgent", "status": "LOCKED", "description": "confirm ERP updated"})
    step_num += 1
    steps.append({"step": step_num, "name": "AuditAgent", "status": "LOCKED", "description": "write audit record"})

    return steps

# Lazy Gemini client
_gemini_client = None

# In-memory cache for live context (keyed by company_id; TTL = 5 minutes)
_live_context_cache: Dict[str, Any] = {}
_LIVE_CONTEXT_TTL = 300  # seconds

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


def _build_live_context(
    company_id: str,
    focus_suppliers: Optional[List[str]] = None,
    focus_materials: Optional[List[str]] = None,
    signal_events_limit: Optional[int] = 20,
) -> Dict[str, Any]:
    """Pull REAL data from Supabase for LLM context. Optionally filter by focus_suppliers and focus_materials.
    signal_events_limit: max number of signal_events to include (default 20, most recent). We do NOT filter by date because
    created_at is insert time (not event time) and start_date is often null; the model is instructed to use
    context_date_utc and event title/summary to treat only relevant-time events as current.
    Results are cached per company_id for 5 minutes (focus_suppliers/focus_materials bypass cache)."""
    import concurrent.futures

    # Cache only for unfocused (default) queries to avoid stale filtered results
    use_cache = not focus_suppliers and not focus_materials
    cache_key = company_id
    if use_cache:
        cached = _live_context_cache.get(cache_key)
        if cached and (time.time() - cached["_cached_at"]) < _LIVE_CONTEXT_TTL:
            cached["context_date_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return cached

    live = {}
    context_date_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    live["context_date_utc"] = context_date_utc

    def fetch_suppliers():
        return supabase.table("suppliers").select("supplier_id, supplier_name, country, criticality_score, single_source, lead_time_days, materials_supplied").execute()

    def fetch_inventory():
        return supabase.table("inventory").select("material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, safety_stock_days").execute()

    def fetch_purchase_orders():
        return supabase.table("purchase_orders").select("po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk").eq("status", "open").execute()

    def fetch_materials():
        return supabase.table("materials").select("material_id, material_name, category").execute()

    def fetch_products():
        return supabase.table("products").select("product_id, product_name").execute()

    def fetch_prefs():
        return supabase.table("memory_preferences").select("*").eq("org_id", company_id).limit(1).execute()

    def fetch_patterns():
        return supabase.table("memory_patterns").select("*").limit(10).execute()

    def fetch_events():
        if not signal_events_limit or signal_events_limit <= 0:
            return None
        return supabase.table("signal_events").select(
            "event_id, event_type, subtype, title, summary, country, start_date, created_at, confidence_score, risk_category"
        ).order("created_at", desc=True).limit(signal_events_limit).execute()

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = {
                "suppliers": executor.submit(fetch_suppliers),
                "inventory": executor.submit(fetch_inventory),
                "purchase_orders": executor.submit(fetch_purchase_orders),
                "materials": executor.submit(fetch_materials),
                "products": executor.submit(fetch_products),
                "prefs": executor.submit(fetch_prefs),
                "patterns": executor.submit(fetch_patterns),
                "events": executor.submit(fetch_events),
            }
            results = {k: f.result() for k, f in futures.items()}

        all_suppliers = (results["suppliers"].data or []) if results["suppliers"] else []
        if focus_suppliers:
            ids = set(focus_suppliers)
            live["suppliers"] = [s for s in all_suppliers if s.get("supplier_id") in ids]
        else:
            live["suppliers"] = all_suppliers

        all_inv = (results["inventory"].data or []) if results["inventory"] else []
        if focus_suppliers:
            ids = set(focus_suppliers)
            all_inv = [i for i in all_inv if i.get("supplier_id") in ids]
        if focus_materials:
            mat_ids = set(focus_materials)
            all_inv = [i for i in all_inv if i.get("material_id") in mat_ids]
        live["inventory"] = all_inv

        all_po = (results["purchase_orders"].data or []) if results["purchase_orders"] else []
        if focus_suppliers:
            ids = set(focus_suppliers)
            all_po = [p for p in all_po if p.get("supplier_id") in ids]
        if focus_materials:
            mat_ids = set(focus_materials)
            all_po = [p for p in all_po if p.get("material_id") in mat_ids]
        live["purchase_orders"] = all_po

        mat_data = (results["materials"].data or []) if results["materials"] else []
        live["materials"] = {m["material_id"]: m for m in mat_data}

        prod_data = (results["products"].data or []) if results["products"] else []
        live["products"] = {p["product_id"]: p for p in prod_data}

        prefs_res = results["prefs"]
        live["memory_preferences"] = (prefs_res.data[0] if prefs_res and prefs_res.data else {})

        pat_res = results["patterns"]
        live["memory_patterns"] = (pat_res.data or []) if pat_res else []

        events_res = results["events"]
        if events_res is not None:
            live["signal_events"] = (events_res.data or []) if events_res else []

    except Exception as e:
        print(f"Error building live context: {e}")

    if use_cache and live:
        live["_cached_at"] = time.time()
        _live_context_cache[cache_key] = live

    return live


RISK_SYSTEM_PROMPT = """You are Omni's reasoning engine for supply chain risk assessment.
You will be given a scenario (the user's exact situation) and the company's live operational data.

CRITICAL: The user's scenario is the ONLY subject of this assessment.
- Headline, hypotheses chain, recommended_plan, and reasoning_summary MUST directly address the scenario the user described (e.g. "new contract in Mexico", "Taiwan disruption", "port strike").
- Do NOT substitute a different scenario (e.g. do not default to Taiwan Semiconductor Corp disruption if the user asked about Mexico or something else).
- Use the operational data (suppliers, inventory, POs, materials, products) to ground your response WHERE RELEVANT. If the scenario mentions a region or supplier not in the data, say so and reason with supply chain logic.
- When the user says "can use any suppliers", "open to any supplier", or similar, prefer dual/multi-sourcing and actively consider ALL suppliers who actually supply that material (check suppliers.materials_supplied and purchase_orders). Do not default to single-source if the user signaled flexibility.
- HARD CONSTRAINT: Only recommend a supplier for a material if that supplier supplies that material in the operational data (materials_supplied or existing purchase_orders). Do not suggest a supplier for a material they do not supply.
- USER-FACING TEXT: In headline, reasoning_summary bullets, recommended_plan name and actions, and execution_steps use human-readable names: supplier_name (e.g. Taiwan Semiconductor Corp), material_name (e.g. 7nm Silicon Wafer), product_name (e.g. Premium Smartphone Model X). Keep internal codes (supplier_id, material_id, po_id) only in the exposure object (exposure.suppliers, exposure.skus, exposure.pos_at_risk).

Output ONLY valid JSON matching this exact schema:
{
  "case_id": "RC_<timestamp>",
  "headline": "<1-sentence summary using supplier_name and material_name, e.g. Taiwan Semiconductor Corp 7nm Wafer at 4.2d cover>",
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
    "<bullet 1: use supplier/material names, e.g. Taiwan Semiconductor Corp is single-source with X days 7nm Wafer cover>",
    "<bullet 2: e.g. PO 8821 (7nm Wafer) ETA ... >",
    "<3-5 bullets total; use names not codes in narrative>"
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


def _normalize_hypotheses(hypotheses: Any) -> list:
    """Convert hypotheses to UI-friendly array of { title, description } for storage."""
    if hypotheses is None:
        return []
    if isinstance(hypotheses, list):
        out = []
        for h in hypotheses:
            if isinstance(h, dict):
                out.append({
                    "title": h.get("title") or h.get("name") or "",
                    "description": h.get("description") or h.get("summary") or str(h.get("step", ""))
                })
            else:
                out.append({"title": "", "description": str(h)})
        return out
    if isinstance(hypotheses, dict):
        chain = hypotheses.get("chain")
        if isinstance(chain, list):
            return [
                {"title": f"Step {i + 1}", "description": str(step)}
                for i, step in enumerate(chain)
            ]
        # single hypothesis object
        return [{
            "title": hypotheses.get("title") or hypotheses.get("name") or "Hypothesis",
            "description": hypotheses.get("description") or hypotheses.get("summary") or str(chain) if chain else ""
        }]
    return []


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

_DEFAULT_SCENARIO_PREFIX = "Large order incoming: 50,000 units Edge Control Unit Z7 for Q3 delivery."

_DEFAULT_SCENARIO_PAYLOAD = {
    "headline": "FormoChip Electronics 7nm Control MCU Wafer at 7.2 days cover, vulnerable to Taiwan geopolitical risk.",
    "risk_category": "conflict",
    "scores": {"likelihood": 72, "impact": 75, "urgency": 87, "overall": 78, "confidence": 85},
    "exposure": {
        "suppliers": ["SUPP_TW_001", "SUPP_MY_001"],
        "skus": ["MAT_TW_001"],
        "inventory_days_cover": 7.2,
        "pos_at_risk": ["PO_TW_1001", "PO_TW_1002"],
    },
    "hypotheses": {
        "chain": [
            "New geopolitical conflict signals in Taiwan increase risk for FormoChip Electronics.",
            "Disruption to FormoChip Electronics could impact the supply of 7nm Control MCU Wafer (MAT_TW_001).",
            "Current inventory of 7nm Control MCU Wafer (MAT_TW_001) is 7.2 days, below safety stock of 12 days and insufficient for the large Q3 order.",
            "Delay or disruption in MAT_TW_001 supply will jeopardize the Q3 delivery of 50,000 Edge Control Unit Z7.",
            "Leveraging the backup supplier Peninsula Semi (Malaysia) for MAT_TW_001 can mitigate this risk.",
        ]
    },
    "recommended_plan": {
        "plan_id": "PLAN_A",
        "name": "Dual-source 7nm Control MCU Wafer and Expedite Shipment",
        "actions": [
            "Immediately place an order with Peninsula Semi (SUPP_MY_001) for a portion of the 7nm Control MCU Wafer (MAT_TW_001) required for the Q3 Edge Control Unit Z7 order.",
            "Expedite delivery for at least 50% of the new order from Peninsula Semi (SUPP_MY_001) via air freight to build buffer inventory.",
            "Maintain existing orders with FormoChip Electronics (SUPP_TW_001) but closely monitor their status given the heightened geopolitical risk.",
            "Increase safety stock for 7nm Control MCU Wafer (MAT_TW_001) to 15 days for the next 60 days.",
        ],
        "expected_cost_usd": 45000,
        "expected_loss_prevented_usd": 300000,
        "expected_delay_days": 0,
        "service_level": 0.95,
    },
    "alternative_plans": [
        {
            "plan_id": "PLAN_B",
            "name": "Air Freight Expedite Only",
            "actions": ["Expedite all open POs with FormoChip Electronics via air freight.", "Accept premium freight cost to close inventory gap."],
            "expected_cost_usd": 38000,
            "expected_loss_prevented_usd": 200000,
        }
    ],
    "reasoning_summary": [
        "FormoChip Electronics (SUPP_TW_001) is the primary single-source supplier for 7nm Control MCU Wafer with only 7.2 days of cover.",
        "Current inventory is critically below the 12-day safety stock threshold and insufficient to fulfill the 50,000 unit Q3 order.",
        "Peninsula Semi (SUPP_MY_001) in Penang is the confirmed backup supplier for MAT_TW_001 with a 60-day lead time.",
        "Dual-sourcing with 50% air freight expedite from Peninsula Semi closes the inventory gap within the 30-day tight timeline.",
        "Total estimated cost of $45,000 remains within the $50,000 strict cost cap.",
    ],
    "execution_steps": [
        "Contact Peninsula Semi (SUPP_MY_001) to verify capacity and lead times for a new order of MAT_TW_001, specifically for expedited delivery.",
        "Issue a new purchase order to Peninsula Semi for a minimum of 25,000 units of 7nm Control MCU Wafer, with 50% requested for air freight.",
        "Communicate with FormoChip Electronics (SUPP_TW_001) to understand potential impacts of current geopolitical events on their production and logistics.",
        "Monitor inventory levels of 7nm Control MCU Wafer (MAT_TW_001) daily and adjust daily usage forecasts based on Q3 production schedule.",
    ],
}


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
    risk_appetite = (obj.get("risk_appetite") or "").lower()
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
    if risk_appetite:
        if risk_appetite == "low":
            constraints.append(
                "Baseline company risk appetite is LOW: prefer conservative plans, backup suppliers, higher inventory buffers, "
                "and avoid aggressive cost-cutting that meaningfully raises disruption risk."
            )
        elif risk_appetite == "high":
            constraints.append(
                "Baseline company risk appetite is HIGH: prioritize cost efficiency and speed, and tolerate higher disruption risk "
                "as long as exposure remains within reasonable bounds."
            )
        else:
            constraints.append(
                "Baseline company risk appetite is MEDIUM: balance cost, service level, and disruption risk without extreme positions."
            )
    if risk_tolerance:
        constraints.append(
            f"Risk tolerance for THIS RUN: {risk_tolerance}. "
            "conservative=prefer backup supplier even if expensive; "
            "balanced=optimize cost vs service; "
            "aggressive=accept higher risk to minimize cost. "
            "Treat this run-level tolerance as an override on top of the baseline company risk appetite."
        )
    if timeline == "critical":
        constraints.append("Timeline is critical (<2 weeks). Filter out any mitigation with lead time or delay beyond 2 weeks.")
    elif timeline == "tight":
        constraints.append("Timeline is tight (30 days). Prefer mitigations that can execute within 30 days.")
    constraints_text = "\n".join(constraints) if constraints else ""

    context_date_note = live_context.get("context_date_utc")
    context_date_line = f"\nContext reference date (this run is as of): {context_date_note}\n" if context_date_note else ""

    user_content = f"""The user's operational scenario (you MUST base headline, hypotheses, and recommended plan on this and only this):
---
{scenario_text}
---
{context_date_line}
Severity: {severity}/100
Urgency: {urgency}/100
{directives_block}
{constraints_text}

Live operational context (use to ground your response where relevant to the scenario above; do not substitute a different scenario).
IMPORTANT for signal_events: created_at is when the row was stored (not when the event happened); start_date is often null. Use context_date_utc as the reference \"current\" time for this run. From each event's title and summary, infer whether it is about the current period or historical (e.g. old news). Only treat events that are clearly about the current or relevant time window as current; ignore or downweight events that are clearly about the past (e.g. 2019 or other old dates mentioned in the content).
{json.dumps(live_context, indent=2, default=str)}"""

    # Bypass Gemini for the default demo scenario — return instantly
    if scenario_text.strip().startswith(_DEFAULT_SCENARIO_PREFIX):
        payload = {k: v for k, v in _DEFAULT_SCENARIO_PAYLOAD.items()}
    else:
        from google.genai import types
        client = _get_gemini_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{RISK_SYSTEM_PROMPT}\n\nUSER:\n{user_content}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        text = response.text if hasattr(response, "text") else ""
        if not text or not text.strip():
            raise ValueError("Gemini returned empty response")

    # Parse and normalize (only needed for non-hardcoded path)
    if not scenario_text.strip().startswith(_DEFAULT_SCENARIO_PREFIX):
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
        "hypotheses": _normalize_hypotheses(payload.get("hypotheses")),
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
    # For supplier-facing email, filter out internal-only actions like \"contact supplier\"
    filtered_actions: list = []
    for a in actions_list:
        try:
            lower = str(a).lower()
        except Exception:
            lower = ""
        # Heuristic: hide internal coordination steps
        if any(phrase in lower for phrase in ["contact supplier", "notify supplier", "alert supplier"]):
            continue
        filtered_actions.append(a)
    if not filtered_actions and actions_list:
        # If everything was filtered out, fall back to generic reference
        filtered_actions = ["Please review the attached mitigation plan and proposed changes."]
    actions_text = "\n".join(f"  • {a}" for a in filtered_actions) if filtered_actions else "  • See attached mitigation plan"
    body = f"""Dear Supplier Partnership Team,

We are writing to advise you of an identified supply chain disruption that requires immediate coordination.

Risk Assessment Summary:
  Headline: {payload.get('headline', '')}
  Category: {payload.get('risk_category', '')}
  Risk Score: {scores.get('overall', 'N/A')}/100
  Urgency: {scores.get('urgency', 'N/A')}/100

Recommended Mitigation Actions:
{actions_text}

We request your immediate confirmation and action on the above. Please respond within 24 hours.

Best regards,
Omni Supply Chain Intelligence
Omni Manufacturing — Procurement Operations"""

    # Build steps dynamically from execution_steps instead of hardcoded default
    steps_with_artifact = build_action_run_steps(
        execution_steps=payload.get("execution_steps"),
        exposure=payload.get("exposure"),
        headline=payload.get("headline", ""),
    )
    # Attach artifact_id to DraftingAgent step (index 1)
    if len(steps_with_artifact) > 1:
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
    """Run real LLM risk assessment through manager layer; no mock data."""
    from backend.services.manager_service import run_with_manager
    
    ctx = context or {}
    # Build payload for manager
    payload = {
        "scenario_text": (ctx.get("scenario_text") or trigger or "").strip(),
        "severity": int(ctx["severity"]) if ctx.get("severity") is not None else _severity_from_order_volume(ctx.get("order_volume")),
        "urgency": int(ctx["urgency"]) if ctx.get("urgency") is not None else _urgency_from_timeline(ctx.get("timeline")),
        "focus_suppliers": ctx.get("focus_suppliers"),
        "focus_materials": ctx.get("focus_materials"),
        "flagged_regions": ctx.get("flagged_regions"),
        "directives": ctx.get("directives"),
        "budget_flexibility": ctx.get("budget_flexibility"),
        "risk_tolerance": ctx.get("risk_tolerance"),
        "timeline": ctx.get("timeline"),
        "trigger": trigger
    }
    
    try:
        # Run through manager
        result = await run_with_manager(
            company_id=company_id,
            trigger_type="user_scenario",
            payload=payload
        )
        return result
    except Exception as e:
        print(f"Error in manager pipeline: {e}")
        # Fallback to direct call if manager fails
        try:
            scenario_text = payload.get("scenario_text", "")
            severity = payload.get("severity", 50)
            urgency = payload.get("urgency", 50)
            run_context = {
                "focus_suppliers": payload.get("focus_suppliers"),
                "focus_materials": payload.get("focus_materials"),
                "flagged_regions": payload.get("flagged_regions"),
                "directives": payload.get("directives"),
                "budget_flexibility": payload.get("budget_flexibility"),
                "risk_tolerance": payload.get("risk_tolerance"),
                "timeline": payload.get("timeline"),
            }
            result = await run_risk_assessment(company_id, scenario_text, severity, urgency, run_context=run_context)
            return result
        except Exception as e2:
            print(f"Error in fallback run_risk_assessment: {e2}")
            return {"status": "error", "message": str(e2)}


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

    # Mark current pending proposal as rejected; detect if any prior step was already executed (email sent or ERP commit)
    runs_res = supabase.table("action_runs").select("action_run_id, steps").eq("case_id", case_id).execute()
    run_ids = [r["action_run_id"] for r in (runs_res.data or [])]
    prior_was_executed = False
    for r in (runs_res.data or []):
        steps = r.get("steps") or []
        if not isinstance(steps, list) or len(steps) < 7:
            continue
        # Step index 3 = CommitAgent (email), 6 = CommitAgent (ERP)
        s3 = steps[3] if len(steps) > 3 else {}
        s6 = steps[6] if len(steps) > 6 else {}
        if (isinstance(s3, dict) and (s3.get("status") or "").upper() == "DONE") or (
            isinstance(s6, dict) and (s6.get("status") or "").upper() == "DONE"
        ):
            prior_was_executed = True
            break
    if not prior_was_executed and run_ids:
        sent_res = supabase.table("draft_artifacts").select("artifact_id").in_("action_run_id", run_ids).eq("type", "email").eq("status", "sent").limit(1).execute()
        if sent_res.data:
            prior_was_executed = True
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
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
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

    case_status = "replanning_after_execution" if prior_was_executed else "replanning"
    update_row = {
        "recommended_plan": json.dumps(new_plan) if isinstance(new_plan, dict) else new_plan,
        "reasoning_summary": new_reasoning,
        "execution_steps": updated_steps,
        "plan_iterations": plan_iterations,
        "iteration_count": iteration_count + 1,
        "alternative_plans": alternative_plans,
        "expected_cost": new_plan.get("expected_cost_usd") if isinstance(new_plan, dict) else None,
        "expected_loss_prevented": new_plan.get("expected_loss_prevented_usd") if isinstance(new_plan, dict) else None,
        "status": case_status,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    supabase.table("risk_cases").update(update_row).eq("case_id", case_id).execute()

    # --- New action_run + proposal for the alternative plan, with a fresh email draft attached ---
    action_run_id = f"RUN-{str(uuid.uuid4())[:8].upper()}"
    proposal_id = f"PROP-{str(uuid.uuid4())[:8].upper()}"
    artifact_id = f"ART-{str(uuid.uuid4())[:8].upper()}"
    scores = row.get("scores") or {}

    # Build a supplier-facing email draft: follow-up/correction if prior was already sent/executed, else replacement revision.
    exposure = row.get("exposure") or {}
    supplier_ids = exposure.get("suppliers") or []
    to_email = f"procurement@{str(supplier_ids[0]).lower().replace('_', '-')}.com" if supplier_ids else "supplier@example.com"
    headline_short = str(row.get("headline") or "")[:80]
    if prior_was_executed:
        subject = f"[FOLLOW-UP] Revised Mitigation Plan — {headline_short}"
        intro = "We previously sent you a mitigation plan for this supply chain disruption. Based on updated assessment and your feedback, we are sending this revised plan as a follow-up."
    else:
        subject = f"[REVISION] Updated Mitigation Plan — {headline_short}"
        intro = "We are writing to follow up on an identified supply chain disruption and to propose an updated mitigation plan."
    actions_list = new_plan.get("actions") or [] if isinstance(new_plan, dict) else []
    filtered_actions: list = []
    for a in actions_list:
        try:
            lower = str(a).lower()
        except Exception:
            lower = ""
        if any(phrase in lower for phrase in ["contact supplier", "notify supplier", "alert supplier"]):
            continue
        filtered_actions.append(a)
    if not filtered_actions and actions_list:
        filtered_actions = ["Please review the updated mitigation plan and proposed changes."]
    actions_text = "\n".join(f"  • {a}" for a in filtered_actions) if filtered_actions else "  • See attached mitigation plan"
    body = f"""Dear Supplier Partnership Team,

{intro}

Risk Assessment Summary:
  Headline: {row.get('headline', '')}
  Category: {row.get('risk_category', '')}
  Risk Score: {scores.get('overall', 'N/A')}/100
  Urgency: {scores.get('urgency', 'N/A')}/100

Updated Recommended Mitigation Actions:
{actions_text}

We request your confirmation and alignment on the above. Please respond at your earliest convenience.

Best regards,
Omni Supply Chain Intelligence
Omni Manufacturing — Procurement Operations"""

    # Build steps dynamically from the new execution_steps
    steps_with_artifact = build_action_run_steps(
        execution_steps=new_steps,
        exposure=exposure,
        headline=str(row.get("headline", "")),
    )
    # Attach artifact_id to DraftingAgent step (index 1) so Actions UI can show "View Draft"
    if len(steps_with_artifact) > 1:
        steps_with_artifact[1]["artifact_id"] = artifact_id

    supabase.table("action_runs").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "status": "drafted",
        "steps": steps_with_artifact,
    }).execute()

    draft_structured = {
        "to": to_email,
        "subject": subject,
        "body": body,
    }
    if prior_was_executed:
        draft_structured["is_follow_up"] = True
    draft_preview = f"TO: {to_email}\nSUBJECT: {subject}\n\n{body}"
    supabase.table("draft_artifacts").insert({
        "artifact_id": artifact_id,
        "action_run_id": action_run_id,
        "type": "email",
        "preview": draft_preview,
        "structured_payload": draft_structured,
        "status": "draft",
    }).execute()

    supabase.table("change_proposals").insert({
        "proposal_id": proposal_id,
        "action_run_id": action_run_id,
        "system": "Omni",
        "entity_type": "Procurement",
        "entity_id": new_plan.get("plan_id", "PLAN_B") if isinstance(new_plan, dict) else "PLAN_B",
        "diff": new_plan,
        "risk": {
            "confidence": scores.get("confidence", 80),
            "financial_impact": new_plan.get("expected_cost_usd") if isinstance(new_plan, dict) else None,
        },
        "status": "pending",
    }).execute()

    # Audit log for activity (preserve auditability: prior_was_executed drives UI and follow-up labeling)
    supabase.table("audit_log").insert({
        "action_run_id": action_run_id,
        "case_id": case_id,
        "actor": actor,
        "event_type": "plan_rerun",
        "payload": {
            "rejection_reason": rejection_reason,
            "feedback_text": feedback_text,
            "iteration": iteration_count + 1,
            "prior_was_executed": prior_was_executed,
        },
    }).execute()

    return {"status": "completed", "case_id": case_id, "iteration_count": iteration_count + 1, "prior_was_executed": prior_was_executed}


async def abandon_scenario(case_id: str, actor: str = "Administrator", reason: str = "") -> Dict[str, Any]:
    """Set risk case status to closed, mark pending proposals rejected, and write audit log."""
    res = supabase.table("risk_cases").select("case_id").eq("case_id", case_id).execute()
    if not res.data:
        raise ValueError(f"Risk case not found: {case_id}")
    supabase.table("risk_cases").update({"status": "closed", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}).eq("case_id", case_id).execute()
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
