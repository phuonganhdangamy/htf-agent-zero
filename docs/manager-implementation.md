# OmniManagerAgent Implementation Summary

## Overview

The OmniManagerAgent has been successfully implemented as a central orchestrator above all agent layers. It coordinates execution, handles failures, maintains session state, and provides health monitoring.

## Files Created

### Core Manager Components
1. **`agents/manager/omni_manager.py`**
   - Main manager agent (`build_omni_manager()`)
   - ManagerDecision creation and logging
   - Tools for checking recent perception and memory patterns

2. **`agents/manager/session_tracker.py`**
   - Session state management
   - Session summary generation using Gemini
   - Statistics aggregation

3. **`agents/manager/health_monitor.py`**
   - Scheduled health checks
   - Auto-escalation of expired proposals
   - Failure rate monitoring

4. **`agents/manager/__init__.py`**
   - Module exports

5. **`agents/manager/README.md`**
   - Documentation

### Database
6. **`database/migrations/add_manager_sessions.sql`**
   - Creates `manager_sessions` table
   - Adds indexes for performance

### Integration
7. **`backend/services/manager_service.py`**
   - Wrapper service that orchestrates existing flows
   - `run_with_manager()` - main entry point for user scenarios
   - `run_perception_with_manager()` - entry point for scheduled perception polls

## Files Modified

1. **`backend/services/agent_runner.py`**
   - `run_pipeline()` now calls `manager_service.run_with_manager()`
   - Falls back to direct `run_risk_assessment()` if manager fails

2. **`backend/routers/chat.py`**
   - `_build_system_prompt()` now includes session summary from `manager_sessions`
   - Chatbot can answer "What has Omni done today?" and "Are there pending approvals?"

3. **`backend/routers/monitoring.py`**
   - Added `GET /api/health/agents` endpoint
   - Calls `health_monitor.run_all_health_checks()`

4. **`agents/root_agent.py`**
   - Added comment noting manager wraps root agent as fallback

## Database Schema

### `manager_sessions` Table
```sql
- session_id (text, unique)
- org_id (text)
- started_at, updated_at, last_pipeline_run_at (timestamptz)
- pipeline_runs (int)
- cases_created (jsonb array)
- actions_approved, actions_pending (int)
- agents_invoked (jsonb array)
- warnings (jsonb array)
- session_summary (text)
```

## Key Features Implemented

### ✅ ManagerDecision Logging
- All routing decisions logged to `audit_log` with `event_type="manager_decision"`
- Visible in Activity Logs tab
- Includes decision reason, agents to invoke, cost hint, fallback strategy

### ✅ Session Tracking
- Tracks pipeline runs, cases created, actions approved/pending
- Generates session summaries using Gemini
- Exposed to chatbot for "what has Omni done today?" queries

### ✅ Health Monitoring
- Checks perception freshness (warns if >30 min old)
- Detects stalled cases (open >2 hours with no execution steps)
- Auto-escalates expired proposals (past `approval_expiry_hours`)
- Monitors agent failure rate (alerts if >3 failures/hour)
- Tests Gemini API connectivity

### ✅ Failure Handling
- Agent failures logged to `audit_log` with `event_type="agent_failure"`
- Manager continues pipeline even if one agent fails
- Fallback to direct calls if manager itself fails

### ✅ Cost Optimization
- Checks for recent perception data (within 15 min) before re-fetching
- Can check memory patterns for reuse (tools provided, logic in manager prompt)

## Integration Points

### User Scenarios (Run Cycle)
```
POST /api/agent/run
  → agent_runner.run_pipeline()
    → manager_service.run_with_manager()
      → Creates ManagerDecision
      → Logs to audit_log
      → Updates session tracker
      → Calls run_risk_assessment() (existing flow)
      → Updates session with results
```

### Scheduled Perception Polls
```
run_perception.py (or scheduled task)
  → manager_service.run_perception_with_manager()
    → Checks for recent data (15 min threshold)
    → Creates ManagerDecision
    → Logs to audit_log
    → Calls perception_service.run_perception_scan() if needed
    → Updates session
```

### Chatbot
```
POST /api/chat
  → build_chat_context()
  → get_latest_session_summary() (from session_tracker)
  → Injects session summary into system prompt
  → User can ask "What has Omni done today?"
```

### Health Checks
```
GET /api/monitoring/health/agents
  → health_monitor.run_all_health_checks()
    → Runs all checks
    → Writes results to audit_log
    → Returns structured report
```

## Next Steps (v2)

The following are marked as `# MANAGER_TODO: implement in v2`:

1. **Direct ADK Agent Invocation**
   - Currently manager delegates to existing services
   - v2: Manager directly invokes ADK agents via `build_omni_manager().run()`

2. **User Preference Learning**
   - Track user behavior from chat history
   - Adjust auto-storage and routing based on preferences

3. **Conflict Detection**
   - Detect when new facts contradict stored knowledge
   - Call verification/reconciliation agents

4. **Topic Tracking**
   - Track topics user asks about repeatedly
   - Auto-suggest tracking for frequently queried topics

5. **Meta-Reasoning**
   - Analyze historical traces for optimization
   - Self-improve prompts and routing heuristics

## Testing

### Manual Testing Steps

1. **Run a scenario:**
   ```bash
   curl -X POST http://localhost:8000/api/agent/run \
     -H "Content-Type: application/json" \
     -d '{"company_id": "ORG_DEMO", "trigger": "Taiwan disruption", "severity": 70, "urgency": 80}'
   ```

2. **Check manager decision in audit_log:**
   ```sql
   SELECT * FROM audit_log WHERE event_type = 'manager_decision' ORDER BY created_at DESC LIMIT 1;
   ```

3. **Check session summary:**
   ```bash
   curl http://localhost:8000/api/chat \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"message": "What has Omni done today?", "org_id": "ORG_DEMO"}'
   ```

4. **Run health checks:**
   ```bash
   curl http://localhost:8000/api/monitoring/health/agents
   ```

## Notes

- Manager is **NOT user-facing** - operates in background
- All decisions are logged for transparency
- Failures are logged but don't crash the system
- Root agent kept as fallback option
- For v1, manager orchestrates existing flows without replacing them
