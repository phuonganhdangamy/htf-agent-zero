# Omni: Autonomous Supply Chain Agent

Omni is an agentic AI system designed to monitor global supply chain disruptions, assess risk from live operational data, and propose mitigation strategies with human-in-the-loop approval.

---

## Current Implementation

### Frontend (React / Vite + Tailwind + TypeScript)

- **Location**: `/frontend`
- **Data**: Reads from Supabase (and backend API fallback where needed). No hardcoded data in UI.
- **Tabs**:
  - **Dashboard** (`/`) — KPIs and fleet map placeholder
  - **Configuration** (`/config`) — Company profile (memory_preferences), Suppliers table + Add modal, Facilities table + Add modal
  - **Events Feed** (`/events`) — `signal_events` table (event_id, event_type, country, subtype, confidence_score, start_date, evidence link)
  - **Risk Cases** (`/cases`) — Table from `risk_cases`; expand inline for scores, hypotheses, plans, execution steps, audit trail. Fetches via Supabase or `GET /api/agent/cases` fallback
  - **Actions** (`/actions`) — Pending change proposals from `change_proposals`; approve/reject
  - **Activity Log** (`/logs`) — `audit_log` table; auto-refresh 30s; case_id links to risk case
  - **Live Simulation** (`/simulation`) — Operational scenario input, severity/urgency sliders, **Run Cycle** → real LLM risk assessment; execution log, risk case output, approval bar, Save as Risk Case
  - **Chatbot** (`/agent`) — Retrieval assistant: internal data + optional commodity prices + Google Search grounding; `POST /api/chat`

### Backend (Python / FastAPI)

- **Location**: `/backend`; entry point `backend/main.py`, runs on `localhost:8000`
- **Key routes**:
  - `POST /api/agent/run` — Fetches live Supabase data, calls Gemini for RiskCase JSON, saves to `risk_cases`, creates `action_runs` + `change_proposals` (no mock data)
  - `GET /api/agent/cases` — List risk cases (optional status, limit, order)
  - `GET /api/agent/cases/{case_id}` — Fetch a single case by `case_id` (or underlying `id` as fallback)
  - `POST /api/agent/approve` — Approve/reject change proposal and advance the action run
  - `POST /api/chat` — Chat with context (Supabase + optional Alpha Vantage commodity prices + Google Search grounding)
  - `POST /api/risk_cases` — Insert risk case; returns `{ case_id }`
  - `POST /api/monitoring/scan` — On-demand perception scan: **fetches from real APIs** — GDACS, ACLED, GDELT, WTO (by supplier countries); OpenWeather (weather at supplier regions/cities); Alpha Vantage (news for manufacturer sector, from materials/industry); FRED (macro: interest, inflation, GDP). LLM normalizes raw data into `signal_events` (no invented events). Saves and auto‑escalates high‑confidence ones.
- **Startup / background jobs**:
  - Seeds `memory_patterns` with default Taiwan Strait pattern if missing
  - Starts a **background perception scheduler** that calls `run_perception_with_manager` every `PERCEPTION_INTERVAL_SECONDS` (default 900s) for `OMNI_COMPANY_ID` (default `ORG_DEMO`), skipping runs when recent perception data exists
- **Agent modules** (`/agents`):
  - ADK pipeline (perception, reasoning, planning, action, reflection) is implemented.
  - **Planning layer** now exposes a pure‑Python **Optimization Engine** that ranks candidate mitigation plans by `feasibility_score` using expected risk reduction, cost, loss prevented, and confidence.
  - Execution Planner uses this optimization tool to select the recommended plan and store **ranked alternative plans** on each `risk_cases` row.

### Database (Supabase / PostgreSQL)

- **Schema**: `/database/schema.sql` — `company_profiles`, `suppliers`, `facilities`, `inventory`, `purchase_orders`, `signal_events`, `risk_cases`, `action_runs`, `change_proposals`, `audit_log`, `memory_preferences`, `memory_patterns`, etc.
- **Seed**: `/database/seed.sql` — Two customer profiles:
  - **ORG_DEMO** — General electronics manufacturer (e.g. SUPP_044 Taiwan Semiconductor Corp), facilities in Germany, 7nm wafer / smartphone product.
  - **ORG_TW_DEMO** — Taiwan-focused industrial electronics manufacturer; see **Customer profile** below.

### Customer profile (Taiwan-focused demo)

The **ORG_TW_DEMO** profile models a mid-market industrial electronics manufacturer ($150M revenue) whose critical supply runs through Taiwan. Use it for demos by setting `OMNI_COMPANY_ID=ORG_TW_DEMO` (backend) and `VITE_DEFAULT_COMPANY_ID=ORG_TW_DEMO` (frontend `.env`).

| Entity | Details |
|--------|--------|
| **Company** | Industrial Electronics Manufacturing; products: Industrial Controllers, Edge Devices; risk appetite: medium. |
| **Primary supplier** | **FormoChip Electronics** (SUPP_TW_001) — Taiwan, Kaohsiung; 7nm Control MCU Wafer + Underfill/Mold Compound; tier 1, single-source for key SKUs; 12-day lead time; backup option via Peninsula Semi. |
| **Backup supplier** | **Peninsula Semi** (SUPP_MY_001) — Malaysia, Penang; same MCU wafer; higher cost, 16-day lead time; used for volume shift when Taiwan risk escalates. |
| **Tier-2 supplier** | **Pacific Packaging Taichung** (SUPP_TW_002) — Taiwan, Taichung; Custom Molded Packaging Shell; 6-day lead time; shows indirect Taiwan exposure. |
| **Facilities** | Assembly + DC in Germany (FAC_EU_TW_01, DC_EU_TW_01); product: Edge Control Unit Z7. |
| **Routes** | Sea: Kaohsiung → Rotterdam; Air: Kaohsiung → Frankfurt; Taichung → Hamburg. |


### Risk case status and closing

- **Open risk case** — A risk case with `status = 'open'`. New cases are created with this status; it means the case is still active (e.g. awaiting decisions, in progress, or from simulation/test). Dashboard KPIs such as “Active Risk Cases” and “Expected loss prevented” count only **open** cases.
- **Closed** — The case is no longer active but is kept for reference. Status is set to `closed` in two situations:
  1. **User rejects the proposal** on the Actions tab — the linked risk case is automatically set to `closed`. The case stays in the Risk Cases list for future reference.
  2. **User clicks “Close case”** on Risk Cases or Case Detail — the backend sets status to `closed`, marks any pending proposals for that case as rejected, and writes an audit event (`POST /api/agent/abandon`). The case remains in the list.
- So risk case status is aligned with actions: reject action → case closed; explicit close → case closed. Only **open** cases are included in dashboard counts.

---

## Running the Application Locally

You need **two terminals**: backend (port 8000) and frontend. If **Run Cycle** or Chat shows `ERR_CONNECTION_REFUSED`, start the backend first.

**Backend (Terminal 1):**
```bash
# From repo root
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # macOS/Linux
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```
Leave running. Optional in `.env`: `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`), `ALPHA_VANTAGE_API_KEY`, `OMNI_COMPANY_ID` (default `ORG_DEMO`; use `ORG_TW_DEMO` for Taiwan profile).

**Frontend (Terminal 2):**
```bash
cd frontend
npm install
npm run dev
```
Set `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_API_URL=http://localhost:8000`.

**Switching to the Taiwan customer profile (ORG_TW_DEMO)**  
- Backend: set `OMNI_COMPANY_ID=ORG_TW_DEMO` in `.env` (perception scheduler and startup monitoring use this).  
- Frontend: set `VITE_DEFAULT_COMPANY_ID=ORG_TW_DEMO` in `frontend/.env` so Dashboard, Configuration, Live Simulation, and Chat use that org.  
- Ensure the Taiwan profile is seeded in Supabase (run the second part of `database/seed.sql` or use the data you added manually).

---

## Next Steps (Planned)

1. **End‑to‑end action execution** — Wire the full ADK action coordinator (drafting → approval → commit → verification → audit) so that when a RiskCase is produced and a proposal is approved, the system can safely push a simulated ERP change, verify it, and log the full trace.
2. **Draft emails / notifications UI** — Extend the existing **View Draft** experience so humans can edit rich email/Slack drafts, save them, and view iteration history per case.
3. **Real Emailing Agent** — Introduce a dedicated **Emailing Agent** in the Action layer that, once a draft is approved, can send real emails via an SMTP provider or API (e.g. SendGrid), with safeguards (sandbox/test inbox, rate limiting, opt‑in per environment).
4. **Ping / user notifications** — Notify designated users when high‑severity risk cases are created or when proposals are pending (email, in‑app toast, or webhook to Slack/Teams), using the same notification infrastructure as the Emailing Agent.
5. **Full ADK pipeline for batch runs** — Use the manager + ADK root agent for scheduled/batch runs so Perception → Reasoning → Planning → Action → Reflection execute with shared context (e.g. via `run_perception_with_manager` and a future `run_with_manager` entrypoint).
6. **Configurable optimization policy** — Expose Optimization Engine weights (risk reduction vs service level vs cost) and constraints (cost caps, minimum service levels) in `memory_preferences` so operations teams can tune how plans are ranked.
7. **Tool usage in agents** — Verify LLM agents consistently call `save_risk_case`, `save_change_proposal`, planning tools, and ERP stubs at runtime when the full ADK pipeline is used, and log decisions into `audit_log` for traceability.

For architecture details, UI→backend mapping, and a **implementation flow** (Users → Frontend → Backend → Database → Gemini/ADK), see `docs/architecture.md`, `docs/ui-mapping.md`, and `docs/implementation-flow.md`.

# Autonomous Supply Chain Resilience Agent
AI Co-Pilot for Mid-Market Manufacturing Stability

## Overview

Global supply chains are increasingly volatile due to geopolitical conflict, climate events, trade policy shifts, and supplier instability. Mid-market manufacturers are particularly vulnerable because they lack the dedicated risk intelligence teams, advanced analytics platforms, and supply chain control towers available to large enterprises.

This project implements an **Autonomous Supply Chain Resilience Agent** that acts as an intelligent operations co-pilot. The system continuously monitors global disruption signals, evaluates operational risk exposure, plans mitigation strategies, and proposes operational actions to maintain supply continuity.

Unlike traditional dashboards, the system behaves like a **strategic operations partner** that can perceive signals, reason about trade-offs, plan responses, and assist in executing mitigation workflows. :contentReference[oaicite:0]{index=0}


---------------------------------------------------------------------

## Core Objectives

The system is designed to:

• Monitor global disruption signals (news, geopolitical events, natural disasters, logistics disruptions)  
• Assess operational risk exposure across suppliers, logistics, and inventory  
• Simulate trade-offs between cost, service levels, and resilience  
• Recommend mitigation strategies such as rerouting, alternative sourcing, or buffer inventory  
• Draft or trigger operational actions including supplier communication or ERP adjustments  
• Learn from previous disruptions to improve future recommendations  

These capabilities align with the goal of creating a proactive AI system that detects early warning signals and initiates mitigation workflows automatically. :contentReference[oaicite:1]{index=1}


---------------------------------------------------------------------

## Agent Architecture Mapping

The system is implemented as a **multi-agent pipeline** orchestrated using Google ADK.  
Each layer contains specialized agents responsible for a well-defined step in the supply chain risk analysis workflow.

Architecture Flow

External Signals  
        ↓
Perception Layer  
        ↓
Reasoning Layer  
        ↓
Planning Layer  
        ↓
Action Layer  
        ↓
Reflection + Memory


---------------------------------------------------------------------

## Layer 1 — Perception Layer

Purpose  
Convert raw global signals into structured disruption events relevant to the manufacturer.

Agent Type  
LLM Agents + Tool Agents

Agents

1. News Monitoring Agent  
Type: Tool Agent  
Tools: News APIs, GDELT, event datasets

Responsibilities
• Continuously monitor global news and disruption signals  
• Detect events such as strikes, geopolitical conflict, port congestion, natural disasters  
• Collect raw text signals and metadata

Input
News feeds, global event datasets

Output
Raw disruption signals


2. Event Structuring Agent  
Type: LLM Agent

Responsibilities
• Convert raw news signals into structured disruption events  
• Extract event type, location, severity indicators, and source evidence  
• Produce structured JSON outputs

Input
Raw event text

Output

{
  event_type: "Port Strike",
  location: "Rotterdam",
  event_date: "2026-03-02",
  disruption_category: "Logistics",
  evidence_sources: [urls]
}


3. Supplier Mapping Agent  
Type: Tool Agent

Responsibilities
• Map disruption events to supplier locations and logistics routes  
• Identify which manufacturers are affected

Input
Structured disruption event

Tools
Supplier database  
ERP supplier location data

Output
Supplier impact mapping


---------------------------------------------------------------------

## Layer 2 — Reasoning Layer

Purpose  
Assess the operational risk of detected disruption events.

Agent Type  
LLM Agent + Rule-based Agent

Agents

4. Severity Classification Agent  
Type: LLM Agent

Responsibilities
• Classify disruption severity  
• Analyze tone, event scale, and frequency of mentions

Output

severity_score
confidence_score


5. Risk Scoring Agent  
Type: Rule-based Agent

Responsibilities
• Combine disruption severity with business context
• Evaluate supplier dependency
• Factor in inventory levels and lead time sensitivity

Input

severity_score  
supplier_dependency  
inventory_levels

Output

{
  disruption_probability: 0.73,
  operational_impact: "High",
  risk_score: 0.82
}


6. Impact Assessment Agent  
Type: LLM Agent

Responsibilities
• Estimate operational consequences
• Identify production delays
• Estimate revenue exposure

Output

• revenue_at_risk  
• service_level_risk  
• production_delay_estimate


---------------------------------------------------------------------

## Layer 3 — Planning Layer

Purpose  
Generate mitigation strategies and evaluate operational trade-offs.

Agent Type  
Planning Agent + Optimization Agent

Agents

7. Scenario Simulation Agent  
Type: Planning Agent

Responsibilities
• Simulate alternative supply chain responses
• Model supplier switching
• Model logistics rerouting

Output

Possible mitigation scenarios


8. Optimization Agent  
Type: Custom Agent

Responsibilities
• Compare trade-offs between cost, service levels, and resilience
• Rank mitigation strategies

Output

ranked mitigation plans


9. Mitigation Planning Agent  
Type: LLM Agent

Responsibilities
• Generate step-by-step mitigation plan
• Explain reasoning behind recommendation

Output

Mitigation Plan

Example

1. Shift 25% of volume to Supplier B  
2. Increase inventory buffer by 12%  
3. Reroute shipments via alternate port


---------------------------------------------------------------------

## Layer 4 — Action Layer

Purpose  
Translate mitigation plans into operational actions.

Agent Type  
Workflow Agent

Agents

10. Supplier Communication Agent  
Type: LLM Agent

Responsibilities
• Draft supplier coordination emails
• Generate negotiation messages
• Provide outreach templates


11. ERP Adjustment Agent  
Type: Tool Agent

Responsibilities
• Suggest updates to purchase orders
• Adjust inventory reorder thresholds
• Propose production schedule changes


12. Escalation Agent  
Type: Workflow Agent

Responsibilities
• Trigger alerts for operations leadership
• Escalate when risk exceeds thresholds

Example Actions

• Draft supplier email  
• Flag ERP purchase order adjustment  
• Recommend buffer stock increase  
• Notify operations leadership


---------------------------------------------------------------------

## Layer 5 — Reflection Layer

Purpose  
Validate decisions before execution.

Agent Type  
LLM Agent

Responsibilities

• Validate mitigation plan against operational constraints  
• Check compliance with business rules  
• Ensure evidence supports recommendations  
• Flag uncertain decisions for human approval


---------------------------------------------------------------------

## Layer 6 — Memory Layer

Purpose  
Enable learning from past disruptions.

Agent Type  
Memory System

Responsibilities

• Store disruption history  
• Track mitigation outcomes  
• Learn supplier reliability patterns  
• Improve future risk predictions

Stored Data

• past disruptions  
• mitigation success rates  
• supplier reliability scores


---------------------------------------------------------------------

## Orchestrator Agent

The entire pipeline is coordinated by an **Orchestration Agent**.

Responsibilities

• Manage the workflow across agents  
• Pass outputs between layers  
• Trigger planning and mitigation workflows  
• Maintain system state

This agent ensures the system follows the structured pipeline:

Perception → Reasoning → Planning → Action → Reflection → Memory