# Omni: Autonomous Supply Chain Agent

Omni is an agentic AI system designed to monitor global supply chain disruptions, assess risk from live operational data, and propose mitigation strategies with human-in-the-loop approval.

## Overview

Global supply chains are increasingly volatile due to geopolitical conflict, climate events, trade policy shifts, and supplier instability. Mid-market manufacturers are particularly vulnerable because they lack the dedicated risk intelligence teams, advanced analytics platforms, and supply chain control towers available to large enterprises.

This project implements an **Autonomous Supply Chain Resilience Agent** that acts as an intelligent operations co-pilot. The system continuously monitors global disruption signals, evaluates operational risk exposure, plans mitigation strategies, and proposes operational actions to maintain supply continuity.

Unlike traditional dashboards, the system behaves like a **strategic operations partner** that can perceive signals, reason about trade-offs, plan responses, and assist in executing mitigation workflows. 

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
## Tech Stack
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

---------------------------------------------------------------------

## Core Objectives

The system is designed to:

• Monitor global disruption signals (news, geopolitical events, natural disasters, logistics disruptions)  
• Assess operational risk exposure across suppliers, logistics, and inventory  
• Simulate trade-offs between cost, service levels, and resilience  
• Recommend mitigation strategies such as rerouting, alternative sourcing, or buffer inventory  
• Draft or trigger operational actions including supplier communication or ERP adjustments  
• Learn from previous disruptions to improve future recommendations  

These capabilities align with the goal of creating a proactive AI system that detects early warning signals and initiates mitigation workflows automatically. 

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
