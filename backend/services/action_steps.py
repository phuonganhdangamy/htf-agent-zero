"""Update action_runs.steps in Supabase (used by agent runner and action agents)."""
import time
from typing import Any, Callable, Dict, List, Optional
from backend.services.supabase_client import supabase
from backend.services.agent_runner import DEFAULT_ACTION_RUN_STEPS


def _is_connection_error(e: Exception) -> bool:
    """True if this looks like a transient connection/transport error (e.g. after reload or idle close)."""
    name = type(e).__name__
    msg = str(e).lower()
    if "RemoteProtocolError" in name or "ConnectionTerminated" in name:
        return True
    if "Connection" in name and ("reset" in msg or "closed" in msg or "terminated" in msg):
        return True
    return False


def _retry_on_connection_error(fn: Callable[[], Any], max_attempts: int = 2) -> Any:
    """Run fn(); on connection/transport errors (e.g. Supabase connection terminated after reload), retry once."""
    exc = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as e:
            exc = e
            if attempt + 1 >= max_attempts or not _is_connection_error(e):
                raise
    raise exc


def get_steps(action_run_id: str) -> List[Dict[str, Any]]:
    """Fetch current steps for an action run. Retries once on connection errors."""
    def _fetch():
        res = supabase.table("action_runs").select("steps").eq("action_run_id", action_run_id).execute()
        if not res.data:
            return []
        steps = res.data[0].get("steps")
        return list(steps) if isinstance(steps, list) else []
    return _retry_on_connection_error(_fetch)


def update_step(
    action_run_id: str,
    step_index: int,
    status: str,
    timestamp: Optional[str] = None,
    artifact_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Update a single step's status (and optionally timestamp, artifact_id) in action_runs.steps.
    step_index is 0-based. Returns updated steps array.
    """
    steps = get_steps(action_run_id)
    if not steps:
        steps = [dict(s) for s in DEFAULT_ACTION_RUN_STEPS]
        supabase.table("action_runs").update({"steps": steps}).eq("action_run_id", action_run_id).execute()
    if step_index < 0 or step_index >= len(steps):
        return steps
    ts = timestamp or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    step = dict(steps[step_index])
    step["status"] = status
    step["timestamp"] = ts
    if artifact_id is not None:
        step["artifact_id"] = artifact_id
    steps[step_index] = step

    # Workflow rules:
    # - When a step is marked DONE, automatically unlock the next step by setting it to PENDING (if currently LOCKED).
    # - When a step is rejected (LOCKED), lock all downstream steps.
    if status == "DONE":
        next_idx = step_index + 1
        if next_idx < len(steps):
            nxt = dict(steps[next_idx])
            if (nxt.get("status") or "LOCKED") == "LOCKED":
                nxt["status"] = "PENDING"
                steps[next_idx] = nxt
    elif status == "LOCKED":
        for i in range(step_index + 1, len(steps)):
            nxt = dict(steps[i])
            nxt["status"] = "LOCKED"
            steps[i] = nxt

    supabase.table("action_runs").update({
        "steps": steps,
        "updated_at": ts,
    }).eq("action_run_id", action_run_id).execute()
    return steps
