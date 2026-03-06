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


---------------------------------------------------------------------

## Handoff Notes / Next Steps (Action Layer UI + Drafts)

### Why “View Draft” may not appear yet

The Actions UI shows a **“View Draft”** button only when the corresponding step in `action_runs.steps` contains an `artifact_id` (which references `draft_artifacts.artifact_id`).

Right now, the **UI + step model support** exists, but the **runtime pipeline does not consistently run DraftingAgent** to generate a `draft_artifacts` row and attach it to `action_runs.steps`. As a result, steps often have no `artifact_id`, and the UI correctly hides the button.

### Required behavior (target)

- DraftingAgent must create a `draft_artifacts` row (type `email`) with `preview` content.
- The draft must be attached to a step by writing `artifact_id` into `action_runs.steps[n].artifact_id`.
- Step 4 (“CommitAgent — send email”) should **NOT send** an email yet; it should only attach the same draft to the step so the operator can review it.

### Implementation checklist

1. **Wire DraftingAgent into the runtime path that creates `action_runs`**
   - In `backend/services/agent_runner.py`, after inserting `action_runs` + `change_proposals`, invoke DraftingAgent (or a lightweight drafting function) using the plan/proposal context.
   - Ensure the draft row includes `action_run_id` so it is linked to the action run.

2. **Ensure DraftingAgent attaches the draft to the step**
   - `agents/action/drafting_agent.py` should:
     - insert into `draft_artifacts`
     - then update `action_runs.steps[1]` (Step 2) to `status='DONE'` and set `artifact_id=<inserted artifact_id>`.

3. **Ensure Step 4 attaches the draft (do not send)**
   - In `backend/services/action_orchestrator.py`, Step 4 should:
     - fetch the latest email draft for the `action_run_id`
     - write that `artifact_id` into `action_runs.steps[3].artifact_id`
     - mark Step 4 as DONE

4. **Confirm UI rendering expectations**
   - In `frontend/src/pages/Actions.tsx`, “View Draft” renders when:
     - `step.artifact_id` exists AND step is `DONE` or `PENDING`.
   - Once steps contain `artifact_id`, expanding the Actions row should show “View Draft” and open a modal showing `draft_artifacts.preview`.
