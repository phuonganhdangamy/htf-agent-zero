# Omni: Autonomous Supply Chain Agent

Omni is an agentic AI system that monitors global supply chain disruptions, assesses risk from live operational data, and proposes mitigation strategies with human-in-the-loop approval. It acts as a **strategic operations partner** that perceives signals, reasons about trade-offs, plans responses, and assists in executing mitigation workflows.

Omni is the **1st Place Winner of Hack the Future 2026**.

- **[Slides](https://www.canva.com/design/DAHDC18Is5w/UhMntz3J-j3On9lAgrAJBQ/view?utm_content=DAHDC18Is5w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h1ff3cd6586)**
- **[Demo Video](https://youtu.be/UNRQj5ybBGg)**
* Note that this was the initial submission, and was iterated and improved on!
---

## Table of Contents

- [Overview & Objectives](#overview--objectives)
- [Features at a Glance](#features-at-a-glance)
- [Agent Architecture by Layer](#agent-architecture-by-layer)
- [Orchestration & Memory](#orchestration--memory)
- [Running the Application](#running-the-application)
- [Customer Profiles](#customer-profiles)
- [Risk Case Status & Closing](#risk-case-status--closing)
- [Planned Work](#planned-work)
- [Further Documentation](#further-documentation)

---

## Overview & Objectives

Global supply chains are volatile due to geopolitical conflict, climate events, trade policy shifts, and supplier instability. Mid-market manufacturers often lack dedicated risk intelligence. Omni is designed to:

- **Monitor** global disruption signals (news, events, weather, trade, macro)
- **Assess** operational risk exposure across suppliers, logistics, and inventory
- **Simulate** trade-offs between cost, service levels, and resilience
- **Recommend** mitigation strategies (rerouting, alternative sourcing, buffer inventory)
- **Draft or trigger** operational actions (supplier communication, ERP adjustments)
- **Learn** from past disruptions to improve future recommendations

The system is implemented as a **multi-agent pipeline** using **Google ADK**, with five layers: **Perception → Reasoning → Planning → Action → Reflection**, plus **Memory** and a central **Orchestrator (OmniManager)**.

---

## Features at a Glance

### Frontend (React / Vite / Tailwind / TypeScript)

| Tab / Route | Purpose |
|-------------|---------|
| **Dashboard** (`/`) | KPIs and fleet map placeholder; reads from Supabase (no hardcoded data). |
| **Configuration** (`/config`) | Company profile (`memory_preferences`), Suppliers table + Add modal, Facilities table + Add modal. |
| **Events Feed** (`/events`) | Disruption events from `signal_events`: event_id, type, country, subtype, confidence, start_date, evidence link. |
| **Risk Cases** (`/cases`) | Table from `risk_cases`; expand inline for scores, hypotheses, plans, execution steps, audit trail. Data via Supabase or `GET /api/agent/cases` fallback. |
| **Actions** (`/actions`) | Pending change proposals from `change_proposals`; approve/reject; view step-by-step execution and draft artifacts (email/ERP/Slack). |
| **Activity Log** (`/logs`) | `audit_log` table; auto-refresh 30s; case_id links to risk case. |
| **Live Simulation** (`/simulation`) | Scenario input, severity/urgency sliders, **Run Cycle** → real LLM risk assessment; execution log, risk case output, approval bar, Save as Risk Case. |
| **Chatbot** (`/agent`) | Retrieval assistant: internal data + optional commodity prices (Alpha Vantage) + Google Search grounding; `POST /api/chat`. |

### Backend (Python / FastAPI)

| Route / Feature | Purpose |
|-----------------|---------|
| `POST /api/agent/run` | Fetches live Supabase data, calls Gemini for RiskCase JSON, saves to `risk_cases`, creates `action_runs` and `change_proposals`. |
| `GET /api/agent/cases`, `GET /api/agent/cases/{case_id}` | List or fetch risk cases (optional status, limit, order). |
| `POST /api/agent/approve` | Approve/reject change proposal; advance action run; write to `audit_log`. |
| `POST /api/chat` | Chat with context (Supabase + optional Alpha Vantage + Google Search). |
| `POST /api/risk_cases` | Insert risk case; returns `{ case_id }`. |
| `POST /api/monitoring/scan` | On-demand perception scan: fetches from **real APIs** (GDACS, ACLED, GDELT, WTO, OpenWeather, Alpha Vantage, FRED), normalizes into `signal_events`, saves and auto-escalates high-confidence events. |
| **Background** | Seeds `memory_patterns` (e.g. Taiwan Strait) if missing; **perception scheduler** calls `run_perception_with_manager` every `PERCEPTION_INTERVAL_SECONDS` (default 900s) for `OMNI_COMPANY_ID`. |

### Database (Supabase / PostgreSQL)

- **Schema**: `database/schema.sql` — `company_profiles`, `suppliers`, `facilities`, `inventory`, `purchase_orders`, `signal_events`, `risk_cases`, `action_runs`, `change_proposals`, `audit_log`, `memory_preferences`, `memory_patterns`, `draft_artifacts`, `manager_sessions`, etc.
- **Seed**: `database/seed.sql` — **ORG_DEMO** (general electronics) and **ORG_TW_DEMO** (Taiwan-focused manufacturer).

### Planning: Optimization Engine

- Pure-Python **Optimization Engine** ranks candidate mitigation plans by `feasibility_score` using expected risk reduction, cost, loss prevented, and confidence.
- Execution Planner uses this tool to select the recommended plan and store **ranked alternative plans** on each `risk_cases` row.

---

## Agent Architecture by Layer

The pipeline is **Perception → Reasoning → Planning → Action → Reflection**. Each layer is implemented in `agents/`; the **root agent** (`agents/root_agent.py`) chains all five. Below are the **actual agents** as implemented in the codebase.

### Layer 1 — Perception

**Purpose:** Turn raw global signals into structured disruption events and persist them.

| Agent | Type | Description |
|-------|------|-------------|
| **Normalizer Agent** | LLM Agent | Single agent in the perception pipeline. Calls external tools (GDACS, ACLED, Alpha Vantage, FRED, OpenWeather, WTO) using target countries from context; gathers disruption signals; parses them into a normalized list of **SignalEvent** objects matching the DB schema (event_id, title, summary, event_type, subtype, country, region, lat/lon, confidence_score, tone, risk_category, evidence_links, signal_sources, forecasted). Calls `save_signal_events` to store in the database. |

**Perception tools (data sources):**

- **GDACS** — Natural disaster alerts (earthquakes, cyclones, floods).
- **ACLED** — Conflict and protest events.
- **Alpha Vantage** — Financial/sector news (e.g. manufacturer sector).
- **FRED** — Macro indicators (interest, inflation, GDP).
- **OpenWeather** — Weather alerts for supplier regions/cities.
- **WTO** — Trade restrictions by supplier countries.
- **save_signal_events** — Writes normalized events to `signal_events` in Supabase.

---

### Layer 2 — Reasoning

**Purpose:** Turn raw/clustered events and business context into a scored **RiskCase** (probability × exposure × impact).

| Agent | Type | Description |
|-------|------|-------------|
| **Cluster Agent** | LLM Agent | Fuses incoming signal events; deduplicates into distinct **EventClusters** by geography, keywords, and time (e.g. typhoon in Taiwan + port delays in Kaohsiung → one cluster). Outputs cluster_id, event_ids, cluster_summary, cluster_geo, cluster_confidence. |
| **Exposure Agent** | LLM Agent | Maps event clusters to business exposure (suppliers, routes, facilities, inventory). Uses Supply Chain Snapshot from context; computes **exposure_score** (0–1) from criticality, single-source status, inventory buffer days. Outputs ExposureReports (affected_assets, exposure_score, rationale). |
| **Hypothesis Agent** | LLM Agent | Generates 1–3 **causal chain hypotheses** (e.g. “Port congestion at Kaohsiung will delay PO 8821 by 14 days → stockout in 4 days”). Assigns severity and probability per hypothesis; output as JSON. |
| **Scoring Agent** | LLM Agent | Uses `read_risk_policy` to load `risk_policy.yaml` (severity models, geo impact, risk_model weights, thresholds, source_trust, recency). Computes risk_score = P × E × I; compares to elevated/high/critical thresholds; builds final **RiskCase** JSON (case_id, cluster_id, risk_category, headline, scores, exposure, hypotheses, status='open'). |
| **Persister Agent** | LLM Agent | Takes the RiskCase JSON from Scoring Agent and calls `save_risk_case` to persist to Supabase. |

**Flow:** Cluster + Exposure run in **parallel** (ParallelAgent); then Hypothesis → Scoring → Persister run **sequentially**.

**Config:** `agents/reasoning/risk_policy.yaml` — severity models (earthquake, cyclone, flood, conflict, trade, etc.), geo impact, risk_model weights, thresholds, source trust scores, recency half-life.

---

### Layer 3 — Planning

**Purpose:** Generate and rank mitigation plans; pick recommended plan and execution steps.

| Agent | Type | Description |
|-------|------|-------------|
| **Plan Generator** | LLM Agent | Reviews RiskCase; uses `get_action_library` to load `action_library.yaml`. Combines 1+ actions into 2–3 **candidate plans** (e.g. “Plan A: Expedite Air Freight”, “Plan B: Activate Backup Supplier”). Outputs plan_id, plan_type, steps, tradeoffs. |
| **Scenario Simulator** | LLM Agent | For each candidate plan, predicts outcome: expected_risk_reduction, expected_cost, expected_loss_prevented, confidence. Outputs SimulationResult per plan. |
| **Execution Planner** | LLM Agent | Receives candidate plans + SimulationResults; calls **optimize_plans_tool** (pure Python `optimization_engine.optimize_plans`) to rank by feasibility_score; selects top as **recommended_plan**, keeps rest as **alternative_plans**; breaks recommended into step-by-step execution plan; calls `save_plans` to store on the risk case in Supabase. |

**Action library** (`agents/planning/action_library.yaml`): REROUTE_SHIPMENT, EXPEDITE_AIR_FREIGHT, ACTIVATE_BACKUP_SUPPLIER, INCREASE_SAFETY_STOCK, REALLOCATE_INVENTORY, ADJUST_PRODUCTION_SCHEDULE, DUAL_SOURCE_SUPPLIER, SUBSTITUTE_MATERIAL — each with category, prerequisites, cost multiplier, expected risk reduction.

**Optimization formula:** `feasibility_score = (loss_prevented * (1 + risk_reduction) * confidence) / (cost + 1)`; plans sorted descending.

---

### Layer 4 — Action

**Purpose:** Turn the execution plan into change proposals and drafts; gate on human approval; commit, verify, and audit.

| Agent | Type | Description |
|-------|------|-------------|
| **Change Proposal Agent** | LLM Agent | Translates finalized execution plan into an **ERP diff**: which entities change (PurchaseOrder, Inventory, Supplier), before/after state. Outputs ChangeProposal schema (proposal_id, action_run_id, system, entity_type, entity_id, diff, status='pending'). Calls `save_change_proposal`. |
| **Drafting Agent** | LLM Agent | Drafts human-readable messages (e.g. supplier email) from Execution Plan and Change Proposal. Does not expose internal cost/loss metrics; tone factual and professional. Outputs DraftArtifact (type=email, preview, structured_payload: to/subject/body). Calls `save_draft_artifact`; draft attached to action run step for “View Draft” in UI. |
| **Approval Agent** | LLM Agent | Human-in-the-loop gate. Uses `poll_for_approval(proposal_id)` to wait for human approve/reject in UI. On approval, passes authorization to Commit Agent; on reject/timeout, aborts and reports failure. |
| **Commit Agent** | LLM Agent | Only runs after approval. Extracts diff from Change Proposal; calls `execute_erp_commit` to push changes to backend ERP APIs (e.g. PUT purchase-orders); calls `report_step_complete` for action run steps. |
| **Verification Agent** | LLM Agent | Post-commit: fetches expected state from proposal and actual state via `verify_erp_state` (GET from ERP); compares; outputs Verification Report; updates step status. |
| **Audit Agent** | LLM Agent | Records outcome in `audit_log` via `write_audit_log` (case_id, action_run_id, actor, event_type, payload). Outputs Audit Summary. |

**Order in pipeline:** Change Proposal → Drafting → Approval → Commit → Verification → Audit.

---

### Layer 5 — Reflection

**Purpose:** Compare predicted vs actual outcomes and update organizational memory.

| Agent | Type | Description |
|-------|------|-------------|
| **Outcome Evaluator** | LLM Agent | Receives case_id and outcome context; calls `evaluate_outcome(case_id)` to compare predicted vs actual risk reduction (from risk_cases and audit). Outputs Outcome Evaluation JSON. |
| **Lesson Extractor** | LLM Agent | Reads Outcome Evaluation; extracts **generalized lessons** or policy recommendations (e.g. “Air freight from Taiwan 10% less effective during typhoons”). Calls `update_memory_from_lesson` to record in system memory (pattern_id, insight, confidence_adj). Outputs extracted lesson JSON. |

---

## Orchestration & Memory

### OmniManager (Orchestrator)

- **Location:** `agents/manager/omni_manager.py`. Not user-facing; coordinates all agents and layers.
- **Responsibilities:** Routing (which agents to run for a given trigger); failure handling (log, retry with reduced scope, don’t crash pipeline); quality checks on outputs (e.g. RiskCase fields, score 0–100); cost optimization (reuse perception when fresh, bias planning from high-confidence memory patterns); proactive triggers (e.g. low inventory, stale risk cases, unverified actions); **session narrative** for “what has Omni done today?” (used by chatbot).
- **Session tracker** (`session_tracker.py`): Tracks pipeline runs, cases created, actions approved/pending, agents invoked, warnings; writes to `manager_sessions`; generates session summary for chat.
- **Health monitor** (`health_monitor.py`): Runs health checks (perception freshness, stalled cases, expired proposals, agent failures, Gemini connectivity); writes to `audit_log` with `event_type="health_check"`; auto-escalates expired proposals. On-demand: `GET /api/monitoring/health/agents` (or equivalent).

**Perception with manager:** Background scheduler in `backend/main.py` calls `run_perception_with_manager(company_id)` every `PERCEPTION_INTERVAL_SECONDS`; skips when recent perception data exists.

### Memory

- **Preference memory** (`memory/preference_memory.py`): Org config from `memory_preferences` (risk appetite, cost cap, fill-rate target, notification threshold, etc.).
- **Pattern memory** (`memory/pattern_memory.py`, `memory_store.py`): Situational patterns from `memory_patterns` (trigger conditions, recommended/avoid actions, confidence). Used to hint the planner; updated by reflection (`update_from_reflection`).
- **Entity memory** (`memory/entity_memory.py`): Supplier/route reliability stats from `memory_entities`.

---

## Running the Application

Use **two terminals**: backend (port 8000) and frontend. If Run Cycle or Chat shows `ERR_CONNECTION_REFUSED`, start the backend first.

**Backend (Terminal 1):**

```bash
# From repo root
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # macOS/Linux
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

Optional in `.env`: `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`), `ALPHA_VANTAGE_API_KEY`, `OMNI_COMPANY_ID` (default `ORG_DEMO`; use `ORG_TW_DEMO` for Taiwan profile).

**Frontend (Terminal 2):**

```bash
cd frontend
npm install
npm run dev
```

Set `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_API_URL=http://localhost:8000`.

**Taiwan customer profile:** Backend: `OMNI_COMPANY_ID=ORG_TW_DEMO`; Frontend: `VITE_DEFAULT_COMPANY_ID=ORG_TW_DEMO`. Ensure Taiwan profile is seeded (second part of `database/seed.sql`).

---

## Customer Profiles

### ORG_DEMO

General electronics manufacturer (e.g. SUPP_044 Taiwan Semiconductor Corp), facilities in Germany, 7nm wafer / smartphone product.

### ORG_TW_DEMO (Taiwan-focused)

| Entity | Details |
|--------|--------|
| **Company** | Industrial Electronics Manufacturing; products: Industrial Controllers, Edge Devices; risk appetite: medium. |
| **Primary supplier** | **FormoChip Electronics** (SUPP_TW_001) — Taiwan, Kaohsiung; 7nm Control MCU Wafer + Underfill/Mold Compound; tier 1, single-source; 12-day lead time; backup via Peninsula Semi. |
| **Backup supplier** | **Peninsula Semi** (SUPP_MY_001) — Malaysia, Penang; same MCU wafer; higher cost, 16-day lead time. |
| **Tier-2** | **Pacific Packaging Taichung** (SUPP_TW_002) — Taiwan, Taichung; Custom Molded Packaging Shell; 6-day lead time. |
| **Facilities** | Assembly + DC in Germany (FAC_EU_TW_01, DC_EU_TW_01); product: Edge Control Unit Z7. |
| **Routes** | Sea: Kaohsiung → Rotterdam; Air: Kaohsiung → Frankfurt; Taichung → Hamburg. |

---

## Risk Case Status & Closing

- **Open:** `status = 'open'`. New cases start open; dashboard KPIs (e.g. Active Risk Cases, Expected loss prevented) count only open cases.
- **Closed:** Set when (1) user **rejects** the proposal on the Actions tab — linked risk case set to `closed`; or (2) user clicks **Close case** — backend sets status to `closed`, marks pending proposals rejected, writes audit event (`POST /api/agent/abandon`). Closed cases remain in the list for reference.

---

## Planned Work

1. **End-to-end action execution** — Wire Commit → Verification → Audit so approved proposals trigger real/simulated ERP commit, verification, and full audit trace.
2. **Draft emails / notifications UI** — Extend “View Draft” to edit, save, and view iteration history for email/Slack drafts.
3. **Real Emailing Agent** — Send approved email drafts via SMTP/API (e.g. SendGrid) with sandbox/test inbox and environment safeguards.
4. **Ping / user notifications** — Notify users when high-severity risk cases are created or proposals are pending (email, in-app, webhook).
5. **Full ADK pipeline for batch runs** — Use manager + ADK root agent for scheduled runs so Perception → Reflection run with shared context.
6. **Configurable optimization policy** — Expose Optimization Engine weights and constraints via `memory_preferences`.
7. **Tool usage in agents** — Ensure agents consistently call save tools and planning/ERP stubs in full ADK runs; log decisions to `audit_log`.

---

## Further Documentation

- **Architecture:** `docs/architecture.md` — pipeline status, what’s implemented vs planned, agent responsibilities.
- **UI mapping:** `docs/ui-mapping.md` — Frontend tabs → Supabase tables and API routes.
- **Implementation flow:** `docs/implementation-flow.md` — Users → Frontend → Backend → Database → Gemini/ADK; clarifies Gemini (LLM) vs ADK (agent framework).
- **Manager:** `agents/manager/README.md` — OmniManager, session tracker, health monitor, DB and integration points.
