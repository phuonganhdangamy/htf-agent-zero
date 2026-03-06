# Omni UI Mapping

This document maps the React frontend UI to Supabase tables and backend API routes as implemented today.

---

## 1. Dashboard (`/`)

- **Component**: `DashboardOverview`
- **Displays**: High-level KPIs and fleet map placeholder.
- **Backend**: Can be wired to `/api/erp/inventory`, `/api/erp/purchase-orders`, `/api/events` for live counts and map data.
- **Database**: `inventory`, `purchase_orders`, `signal_events` (when wired).

---

## 2. Configuration (`/config`)

- **Component**: `Configuration`
- **Displays**: Three collapsible sections — Company Profile, Suppliers, Facilities. No chatbot.
- **Data source**: Supabase only.
  - **Company Profile**: `memory_preferences` WHERE `org_id = ORG_DEMO`; fields (e.g. industry, risk_appetite, cost_cap, fill_rate_target, notification_threshold) stored in `objectives`; Save upserts `memory_preferences`.
  - **Suppliers**: Table from `suppliers`; Add Supplier modal inserts a new row.
  - **Facilities**: Table from `facilities`; Add Facility modal inserts a new row.
- **Backend**: None (direct Supabase from frontend).
- **Database**: `memory_preferences`, `suppliers`, `facilities`.

---

## 3. Events Feed (`/events`)

- **Component**: `EventsFeed`
- **Displays**: Rows from `signal_events`: event_id, event_type badge, country, subtype, confidence_score, start_date, one evidence link.
- **Data source**: Supabase `signal_events`.
- **Backend**: Optional `GET /api/events` (backend also reads `signal_events`).
- **Database**: `signal_events`.

---

## 4. Risk Cases (`/cases`)

- **Component**: `RiskCases`
- **Displays**: Table of risk cases (case_id, headline, risk_category, status, overall score, created_at). Click row to expand inline:
  - **Scores breakdown** — compact pills for likelihood/impact/urgency/overall, color-coded by severity.
  - **Hypotheses chain** — human-readable causal chain, normalized from either array or `{ chain: [...] }` format.
  - **Recommended plan** — name, key actions, and summary metrics (expected cost, loss prevented, delay, service level).
  - **Alternative plans** — ranked list from the Optimization Engine with per-plan actions and trade-offs.
  - **Execution steps** — ordered list of pipeline steps for the case.
  - **Audit trail** — `audit_log` entries for that `case_id`.
- **Data source**: Supabase `risk_cases` when available; otherwise **fallback** `GET /api/agent/cases?limit=100&order=created_at.desc`.
- **Expand**: Audit trail from `audit_log` WHERE `case_id` (Supabase or `GET /api/agent/audit/{case_id}`).
- **Database**: `risk_cases`, `audit_log`.

---

## 5. Case Detail (`/cases/:id`)

- **Component**: `CaseDetail`
- **Displays**:
  - Header: headline, case_id, category, status badge, and overall score (from `scores.overall` / `scores.overall_risk`).
  - **Business Exposure**: human-readable summary from `risk_cases.exposure` (suppliers at risk, SKUs, inventory days cover, POs at risk, affected assets, and any extra fields).
  - **Proposed Mitigation Plans**: cards from `risk_cases.alternative_plans` with plan type/name, `feasibility_score`, and step list.
  - **Pending Change Proposals**: per-proposal card showing system/entity and a readable diff (actions + field-level “from → to” changes) instead of raw JSON.
- **Data source**:
  - Supabase `risk_cases` (lookup by `case_id` then by table `id` as fallback) and `change_proposals` (joined via `action_runs.case_id`).
  - Backend `GET /api/agent/cases/{case_id}` as a fallback when Supabase is not configured.
- **Database**: `risk_cases`, `change_proposals`.

---

## 6. Actions & Approval (`/actions`)

- **Component**: `ActionsApproval`
- **Displays**:
  - Table of pending and historical change proposals from `change_proposals` joined with `action_runs` and `risk_cases`.
  - Per-row summary: entity, risk category/headline, human-readable diff (actions + field-level from/to).
  - Expandable step-by-step view of `action_runs.steps` with status chips and timestamps.
  - **View Draft** button on steps with `artifact_id` to open the email/ERP/Slack draft modal (typed rendering for each draft type).
- **Data source**: Supabase `change_proposals` + `action_runs` + `risk_cases`.
- **Backend**:
  - `POST /api/agent/approve` with `proposal_id`, `approved_by`, `decision` (approve/reject) — updates `change_proposals`, advances the action run, and writes to `audit_log`.
  - `POST /api/agent/action_runs/{action_run_id}/advance` and `PATCH /api/agent/action_runs/{action_run_id}/steps` for fine-grained step approval/rejection in the stepper.
- **Database**: `change_proposals`, `action_runs`, `draft_artifacts`, `audit_log`.
- **Note**: Commit/verification against a real ERP is still simulated; a future Emailing Agent / ERP connector will send real emails and perform real writes when explicitly enabled.

---

## 7. Activity Log (`/logs`)

- **Component**: `ActivityLog`
- **Displays**: Table from `audit_log`: timestamp, event_type, case_id (link to risk case), actor, one-line summary from payload. Auto-refresh every 30 seconds.
- **Data source**: Supabase `audit_log`.
- **Database**: `audit_log`.

---

## 8. Live Simulation (`/simulation`)

- **Component**: `LiveSimulation`
- **Displays**: Left: Company profile + suppliers + Memory Patterns (from `memory_patterns`). Center: Scenario textarea, severity/urgency sliders, Run Cycle button; execution log; risk case output (headline, gauges, hypotheses, recommended plan + metrics); approval bar when a change proposal exists. Right: Risk matrix, Supply Chain Health, Save as Risk Case button.
- **Flow**:
  1. User edits scenario (default: operational scenario with SUPP_044, 4.2 days inventory), adjusts sliders, clicks **Run Cycle**.
  2. Frontend calls `POST /api/agent/run` with `scenario_text`, `severity`, `urgency`, `company_id`, `trigger`.
  3. Backend (`agent_runner.run_risk_assessment`) fetches live data from Supabase, calls Gemini for RiskCase JSON, saves to `risk_cases`, creates `action_runs` and `change_proposals`.
  4. Frontend polls `GET /api/agent/cases?status=open&limit=1` until a case appears; shows execution steps and case card; loads pending proposal for approval bar.
  5. Approval bar shows human-readable summary from `recommended_plan`; Approve/Reject call `POST /api/agent/approve`.
  6. **Save as Risk Case** calls `POST /api/risk_cases` with current case payload and redirects to `/cases`.
- **Backend**: `POST /api/agent/run`, `GET /api/agent/cases`, `POST /api/agent/approve`, `POST /api/risk_cases`.
- **Database**: `risk_cases`, `action_runs`, `change_proposals`, `memory_preferences`, `suppliers`, `memory_patterns`.

---

## 9. Chatbot (`/agent`)

- **Component**: `OmniAgentPanel`
- **Displays**: Conversational UI; user asks questions; responses from backend with internal data + optional commodity prices + Google Search grounding.
- **Backend**: `POST /api/chat` with `message`, `org_id`. Backend builds context (risk_cases, suppliers, inventory, open purchase_orders, optional Alpha Vantage commodity_prices), builds system prompt (internal data vs web search rules), calls Gemini (optionally with Google Search tool). Returns `{ response }`.
- **Database**: Read-only for context: `risk_cases`, `suppliers`, `inventory`, `purchase_orders`. Optional: Alpha Vantage API for commodity prices.
- **Note**: Does not trigger agent pipelines; retrieval and search only.

---

## Next Steps (UI / Integration)

- **Action layer**: After approve in Live Simulation or Actions, trigger commit to ERP and show verification + audit in UI.
- **Draft emails**: New view or section to list `draft_artifacts`, preview, and “Send” or “Edit then send” (email/Slack).
- **Emailing Agent**: Introduce a dedicated Emailing Agent that can send approved drafts via SMTP/API to a configured account (initially a sandbox inbox), with clear safeguards per environment.
- **Ping notifications**: Notify users when high-severity risk cases are created or proposals need approval (email, in-app, or webhook).
