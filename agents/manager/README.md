# OmniManagerAgent

Central orchestrator that sits above all agent layers and coordinates execution, handles failures, and maintains system-wide context.

## Components

### `omni_manager.py`
- Main manager agent (`build_omni_manager()`) - ADK LlmAgent that wraps all layer coordinators
- ManagerDecision creation and logging
- Tools for checking recent perception data and memory patterns

### `session_tracker.py`
- Session state management (`manager_sessions` table)
- Tracks pipeline runs, cases created, actions approved/pending, agents invoked, warnings
- Generates session summaries using Gemini for chatbot context

### `health_monitor.py`
- Scheduled health checks (perception freshness, stalled cases, expired proposals, agent failures, Gemini connectivity)
- Writes results to `audit_log` with `event_type="health_check"`
- Auto-escalates expired proposals and writes alerts

## Database

### `manager_sessions` table
Created via migration: `database/migrations/add_manager_sessions.sql`

Fields:
- `session_id` (unique)
- `org_id`
- `started_at`, `updated_at`, `last_pipeline_run_at`
- `pipeline_runs` (int)
- `cases_created` (jsonb array)
- `actions_approved`, `actions_pending` (int)
- `agents_invoked` (jsonb array)
- `warnings` (jsonb array)
- `session_summary` (text)

## Integration Points

1. **`backend/services/agent_runner.py`**
   - `run_pipeline()` now calls `manager_service.run_with_manager()`
   - Falls back to direct `run_risk_assessment()` if manager fails

2. **`backend/routers/chat.py`**
   - Reads `manager_sessions` for session summary
   - Injects session activity into chatbot system prompt

3. **`backend/routers/monitoring.py`**
   - Added `GET /api/health/agents` endpoint
   - Calls `health_monitor.run_all_health_checks()`

4. **`agents/root_agent.py`**
   - Kept as fallback option
   - Manager wraps root agent as a sub-agent

## Usage

### Running Health Checks

Health checks can be run on-demand via:
```bash
curl http://localhost:8000/api/monitoring/health/agents
```

For scheduled runs (every 5 minutes), add to your cron/scheduler:
```python
from agents.manager.health_monitor import run_all_health_checks
run_all_health_checks()
```

### Running Perception with Manager

```python
from backend.services.manager_service import run_perception_with_manager
result = await run_perception_with_manager(company_id="ORG_DEMO")
```

In production, `backend/main.py` starts a background perception scheduler on app startup that calls `run_perception_with_manager` every `PERCEPTION_INTERVAL_SECONDS` seconds (default 900s) for `OMNI_COMPANY_ID` (default `ORG_DEMO`), and skips runs when fresh `signal_events` already exist.

### Getting Session Summary

```python
from agents.manager.session_tracker import get_latest_session_summary
summary = get_latest_session_summary("ORG_DEMO")
```

## ManagerDecision Logging

All manager decisions are logged to `audit_log` with `event_type="manager_decision"`. View in Activity Logs tab.

## Notes

- Manager is NOT user-facing - it operates in the background
- For v1, manager orchestrates existing flows without replacing them
- In v2, manager will directly invoke ADK agents instead of delegating to existing services
- All failures are logged but don't crash the pipeline (fallback behavior)
