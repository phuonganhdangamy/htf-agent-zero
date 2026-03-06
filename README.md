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
  - `POST /api/agent/run` — Fetches live Supabase data, calls Gemini for RiskCase JSON, saves to `risk_cases`, creates action_run + change_proposal (no mock data)
  - `GET /api/agent/cases` — List risk cases (optional status, limit, order)
  - `POST /api/agent/approve` — Approve/reject change proposal
  - `POST /api/chat` — Chat with context (Supabase + optional Alpha Vantage commodity prices + Google Search grounding)
  - `POST /api/risk_cases` — Insert risk case; returns `{ case_id }`
- **Startup**: Seeds `memory_patterns` with default Taiwan Strait pattern if missing
- **Agent modules** (`/agents`): ADK pipeline (perception, reasoning, planning, action, reflection) is built but **Live Simulation uses a dedicated Gemini flow** in `backend/services/agent_runner.py` (real data → prompt → parse → save), not the full ADK run

### Database (Supabase / PostgreSQL)

- **Schema**: `/database/schema.sql` — `company_profiles`, `suppliers`, `facilities`, `inventory`, `purchase_orders`, `signal_events`, `risk_cases`, `action_runs`, `change_proposals`, `audit_log`, `memory_preferences`, `memory_patterns`, etc.
- **Seed**: `/database/seed.sql` — Demo org, suppliers (e.g. SUPP_044 Taiwan), facilities, POs, inventory (4.2 days cover), memory_preferences

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
Leave running. Optional: `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`), `ALPHA_VANTAGE_API_KEY` in `.env`.

**Frontend (Terminal 2):**
```bash
cd frontend
npm install
npm run dev
```
Set `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_API_URL=http://localhost:8000`.

---

## Next Steps (Planned)

1. **Action layer integration** — Wire the full ADK action coordinator (drafting → approval → commit → verification → audit) so that when a RiskCase is produced, the system automatically drafts change proposals, waits for HITL, then commits and verifies against the ERP.
2. **Draft emails / notifications** — Use the existing Drafting Agent and `draft_artifacts` table to generate human-readable emails or Slack messages for stakeholders; expose in UI and allow “Send” or “Edit then send.”
3. **Ping / user notifications** — Notify designated users when high-severity risk cases are created or when proposals are pending (email, in-app, or webhook to Slack/Teams).
4. **Full ADK pipeline for batch runs** — Optionally run the full perception → reasoning → planning → action → reflection pipeline (e.g. on a schedule or webhook) in addition to the on-demand Live Simulation Gemini flow.
5. **Context propagation** — Ensure `case_id` and `proposal_id` flow correctly from reasoning through planning to action so audit trails and approvals link back to the right case.
6. **Tool usage in agents** — Verify LLMs actually call `save_risk_case`, `save_change_proposal`, and ERP tools at runtime when the full ADK pipeline is used.

For architecture details and UI→backend mapping, see `docs/architecture.md` and `docs/ui-mapping.md`.

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

## System Architecture

The system follows a **modular agent architecture** that separates responsibilities across layers.  
This ensures transparency, reliability, and controllability of the AI system.

Architecture Flow:

Perception Layer  
        ↓  
Reasoning Layer  
        ↓  
Planning Layer  
        ↓  
Action Layer  
        ↓  
Reflection + Memory Layer


Each layer contains specialized agents responsible for a specific task within the decision pipeline.


---------------------------------------------------------------------

## Perception Layer

### Goal
Transform raw external signals into structured disruption events relevant to the manufacturer.

### Responsibilities

• Ingest external data sources (news APIs, global event datasets)  
• Extract geographic location, event type, severity indicators, and evidence  
• Map events to supplier locations or logistics routes  
• Convert raw signals into structured disruption records  

### Agents

News Monitoring Agent  
Scans global news feeds and event datasets to detect potential disruptions such as port strikes, geopolitical conflict, natural disasters, or policy changes.

Event Structuring Agent  
Uses an LLM to convert raw text signals into structured JSON events containing location, disruption type, severity indicators, and source evidence.

Supplier Mapping Agent  
Matches disruption events with supplier locations, manufacturing facilities, and logistics routes to determine operational relevance.

### Example Output

{
  event_type: "Port Strike",
  location: "Rotterdam",
  affected_supplier: "Supplier A",
  disruption_severity: "High",
  evidence_links: [source_urls]
}


---------------------------------------------------------------------

## Reasoning Layer

### Goal
Interpret structured disruption signals and determine their operational risk.

### Responsibilities

• Evaluate disruption severity and probability  
• Incorporate business context such as supplier dependency and inventory levels  
• Estimate operational impact  
• Compute a risk score for the disruption

### Agents

Severity Classification Agent  
Determines disruption severity using structured event data and contextual signals.

Risk Scoring Agent  
Applies business rules and operational data to calculate a disruption risk score.

Impact Assessment Agent  
Estimates operational consequences such as production delays, revenue exposure, or service level violations.

### Output

Structured risk assessment including:

• Disruption probability  
• Impact severity  
• Operational exposure  
• Overall risk score


---------------------------------------------------------------------

## Planning Layer

### Goal
Generate mitigation strategies and evaluate trade-offs before action is taken.

### Responsibilities

• Simulate mitigation options  
• Compare trade-offs between cost, service level, and resilience  
• Produce an ordered mitigation plan

### Agents

Scenario Simulation Agent  
Simulates alternative operational strategies such as supplier switching or logistics rerouting.

Optimization Agent  
Evaluates trade-offs between operational cost, inventory buffers, and delivery timelines.

Mitigation Planning Agent  
Generates a recommended mitigation plan with step-by-step actions.


### Example Plans

• Increase inventory buffer by 10%  
• Shift 30% of supplier volume to backup supplier  
• Reroute shipments through alternate port  


---------------------------------------------------------------------

## Action Layer

### Goal
Translate mitigation strategies into operational actions while maintaining human oversight.

### Responsibilities

• Generate operational recommendations  
• Draft communications  
• Propose ERP system adjustments  
• Trigger escalation alerts

### Agents

Supplier Communication Agent  
Generates draft emails for supplier coordination or contract renegotiation.

ERP Adjustment Agent  
Suggests updates to purchase orders, inventory policies, or production schedules.

Escalation Agent  
Alerts operations leadership when disruption risk exceeds predefined thresholds.

### Example Actions

• Draft supplier outreach email  
• Flag purchase order adjustment  
• Recommend inventory build  
• Escalate to operations leadership


---------------------------------------------------------------------

## Reflection Layer

### Goal
Evaluate system decisions and validate outcomes before committing actions.

### Responsibilities

• Validate recommendations against operational constraints  
• Check policy compliance  
• Identify potential reasoning errors  
• Decide whether human approval is required


---------------------------------------------------------------------

## Memory Layer

### Goal
Enable continuous learning and improve future mitigation recommendations.

### Responsibilities

• Store past disruption events  
• Track mitigation success or failure  
• Learn supplier reliability patterns  
• Improve risk prediction models over time

Memory enables the system to gradually refine decision strategies as it observes more disruptions.


---------------------------------------------------------------------

## Technology Stack

Backend  
Python

Frontend  
React

Database  
Supabase

LLM Reasoning  
Google Gemini

Agent Framework  
Google Agent Development Kit (ADK)

Data Sources

News APIs  
GDELT global news dataset  
Conflict and disaster event datasets  
Supply chain datasets


---------------------------------------------------------------------

## Data Inputs

The system requires operational context from the manufacturer, including:

Supplier Information  
Supplier locations  
Supplier dependency levels  
Contract structures

Operational Data  
Inventory levels  
Lead times  
Production schedules  
Service level agreements

Logistics Data  
Shipping routes  
Ports used  
Distribution centers

External Signals  
News reports  
Natural disasters  
Geopolitical conflict  
Trade policy changes


---------------------------------------------------------------------

## Responsible AI Principles

Reliability  
The modular architecture ensures each component performs a clearly defined task that can be independently tested and validated.

Security  
Operational actions are restricted by role-based permissions and approval workflows.

Human Oversight  
High-impact decisions such as supplier changes or ERP modifications require human confirmation before execution.

Transparency  
The system produces explainable reasoning traces that justify risk assessments and mitigation plans.


---------------------------------------------------------------------

## Future Extensions

Potential future capabilities include:

• Automated supplier discovery for backup sourcing  
• Predictive disruption forecasting using historical data  
• Integration with enterprise ERP platforms  
• Reinforcement learning from mitigation outcomes  
• Multi-company network risk modeling


---------------------------------------------------------------------

## Summary

The Autonomous Supply Chain Resilience Agent demonstrates how AI agents can transform supply chain operations from reactive monitoring to proactive risk mitigation.

By combining perception, reasoning, planning, and controlled action layers, the system functions as a strategic AI co-pilot that helps manufacturers maintain operational stability in an increasingly volatile global environment.