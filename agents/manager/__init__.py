"""
OmniManagerAgent - Central orchestrator for all agent layers.
"""
from agents.manager.omni_manager import (
    build_omni_manager,
    create_manager_decision,
    MANAGER_SYSTEM_PROMPT
)
from agents.manager.session_tracker import (
    get_or_create_session,
    update_session,
    generate_session_summary,
    get_latest_session_summary,
    get_session_stats
)
from agents.manager.health_monitor import (
    run_all_health_checks,
    check_perception_freshness,
    check_stalled_cases,
    check_expired_proposals,
    check_agent_failure_rate,
    check_gemini_connectivity
)

__all__ = [
    "build_omni_manager",
    "create_manager_decision",
    "MANAGER_SYSTEM_PROMPT",
    "get_or_create_session",
    "update_session",
    "generate_session_summary",
    "get_latest_session_summary",
    "get_session_stats",
    "run_all_health_checks",
    "check_perception_freshness",
    "check_stalled_cases",
    "check_expired_proposals",
    "check_agent_failure_rate",
    "check_gemini_connectivity"
]
