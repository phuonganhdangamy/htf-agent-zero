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
