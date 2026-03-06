"""
OmniManagerAgent - Central orchestrator above all agents and layers.

The manager is NOT user-facing. It coordinates all agents, handles failures,
makes routing decisions, and maintains system-wide context.
"""
import json
import time
from typing import Dict, Any, Optional, List
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools import FunctionTool
from backend.services.supabase_client import supabase

from agents.perception.agent import build_perception_pipeline
from agents.reasoning.agent import build_reasoning_coordinator
from agents.planning.agent import build_planning_coordinator
from agents.action.agent import build_action_coordinator
from agents.reflection.agent import build_reflection_coordinator
from agents.root_agent import build_omni_root_agent

MANAGER_SYSTEM_PROMPT = """You are OmniManager, the central orchestrator for Omni's autonomous supply chain resilience system.

You coordinate all agents and layers. You are never directly visible to the end user.

YOUR RESPONSIBILITIES:

1. ROUTING
   Given any trigger (user scenario, scheduled run, alert), decide which agents to invoke and in what order.
   - Simple status query → skip to memory read, no full pipeline
   - New disruption scenario → full pipeline: perception → reasoning → planning → action
   - Post-action follow-up → reflection only
   - Background perception poll → perception + reasoning only, skip planning if risk score < threshold

2. FAILURE HANDLING  
   If any agent returns an error or empty result:
   - Log the failure to audit_log with event_type "agent_failure"
   - Attempt once with reduced scope
   - If still failing, skip that agent and continue pipeline
   - Never crash the full pipeline due to one agent failure
   - Surface a warning in execution_steps so the frontend shows it

3. QUALITY CONTROL
   Before passing output from one agent to the next, check:
   - Does the output contain required fields? (e.g. RiskCase must have scores, exposure, hypotheses)
   - Is the risk score within 0-100?
   - Are evidence_links populated?
   If not: flag as low_confidence, add to unknowns, continue.

4. COST OPTIMIZATION
   - If a matching memory pattern exists with confidence > 0.80, bias the planning layer toward that pattern instead of running full scenario simulation
   - If perception ran within the last 15 minutes for the same countries, reuse existing signal_events instead of re-fetching
   - Track approximate token usage per run and log to audit_log

5. PROACTIVE TRIGGERS (background, no user input needed)
   The manager runs on a schedule via the existing polling loop.
   On each scheduled run, independently decide:
   - Is inventory for any tracked material below safety_stock_days?
     → trigger reasoning + alert agent without user asking
   - Are there open risk_cases with status "monitoring" that haven't been updated in 24 hours?
     → re-run reasoning on those cases with fresh perception data
   - Did any approved action's ETA pass without verification?
     → trigger verification_agent and write alert

6. SESSION NARRATIVE
   Maintain a running summary of what the system has done this session in a "session_log" list in ADK session state.
   The chatbot can read this to answer "what has Omni done today?"

Always output a structured ManagerDecision object before invoking any sub-agent.
"""


@FunctionTool
def log_manager_decision(decision_json: str) -> str:
    """Logs a ManagerDecision to audit_log for transparency and inspection."""
    try:
        decision = json.loads(decision_json)
        supabase.table("audit_log").insert({
            "event_type": "manager_decision",
            "actor": "OmniManager",
            "payload": decision
        }).execute()
        return json.dumps({"status": "logged", "decision_id": decision.get("decision_id")})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def log_agent_failure(agent_name: str, error_message: str, context: str = "") -> str:
    """Logs an agent failure to audit_log for monitoring and debugging."""
    try:
        supabase.table("audit_log").insert({
            "event_type": "agent_failure",
            "actor": "OmniManager",
            "payload": {
                "agent_name": agent_name,
                "error_message": error_message,
                "context": context,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
        }).execute()
        return json.dumps({"status": "logged"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@FunctionTool
def check_recent_perception(countries: str) -> str:
    """Checks if perception data exists for given countries within the last 15 minutes. Returns timestamp if found, empty if not."""
    try:
        country_list = [c.strip() for c in countries.split(",")]
        # Query signal_events for recent entries matching countries
        cutoff_time = time.time() - (15 * 60)  # 15 minutes ago
        cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
        
        res = supabase.table("signal_events").select("created_at, country").in_("country", country_list).gte("created_at", cutoff_str).order("created_at", desc=True).limit(1).execute()
        
        if res.data:
            return json.dumps({"has_recent": True, "latest": res.data[0].get("created_at")})
        return json.dumps({"has_recent": False})
    except Exception as e:
        return json.dumps({"error": str(e), "has_recent": False})


@FunctionTool
def check_memory_patterns(risk_category: str, confidence_threshold: float = 0.80) -> str:
    """Checks for matching memory patterns with confidence above threshold. Returns pattern if found."""
    try:
        res = supabase.table("memory_patterns").select("*").eq("risk_category", risk_category).gte("confidence", confidence_threshold).order("confidence", desc=True).limit(1).execute()
        if res.data:
            return json.dumps({"found": True, "pattern": res.data[0]})
        return json.dumps({"found": False})
    except Exception as e:
        return json.dumps({"error": str(e), "found": False})


def build_omni_manager() -> LlmAgent:
    """
    Builds the OmniManagerAgent that orchestrates all layer coordinators.
    
    The manager wraps all existing coordinators and adds decision-making,
    failure handling, and optimization logic on top.
    """
    # Import all layer coordinators
    perception_pipeline = build_perception_pipeline()
    risk_reasoner_coordinator = build_reasoning_coordinator()
    planning_coordinator = build_planning_coordinator()
    action_coordinator = build_action_coordinator()
    reflection_coordinator = build_reflection_coordinator()
    
    # Also include root agent as a fallback option
    root_agent = build_omni_root_agent()
    
    manager = LlmAgent(
        name="OmniManagerAgent",
        description="Central orchestrator that routes requests, handles failures, and optimizes agent execution across all layers.",
        instruction=MANAGER_SYSTEM_PROMPT,
        model="gemini-2.5-flash",
        tools=[
            log_manager_decision,
            log_agent_failure,
            check_recent_perception,
            check_memory_patterns
        ],
        sub_agents=[
            perception_pipeline,
            risk_reasoner_coordinator,
            planning_coordinator,
            action_coordinator,
            reflection_coordinator,
            root_agent  # Fallback option
        ]
    )
    
    return manager


def create_manager_decision(
    trigger_type: str,
    decision: str,
    reason: str,
    skip_perception: bool = False,
    skip_planning: bool = False,
    cost_hint: str = "medium",
    agents_to_invoke: Optional[List[str]] = None,
    fallback_if_failure: str = "continue_without"
) -> Dict[str, Any]:
    """
    Creates a ManagerDecision object for logging.
    
    Args:
        trigger_type: "user_scenario" | "scheduled" | "alert" | "post_action"
        decision: "full_pipeline" | "perception_only" | "reasoning_only" | "planning_only" | "reflection_only" | "memory_read" | "skip"
        reason: One sentence explanation
        skip_perception: True if recent data reusable
        skip_planning: True if risk below threshold
        cost_hint: "low" | "medium" | "high"
        agents_to_invoke: List of agent names to call
        fallback_if_failure: "continue_without" | "escalate" | "abort"
    
    Returns:
        ManagerDecision dict ready for JSON serialization
    """
    decision_id = f"MD_{int(time.time())}_{str(time.time()).split('.')[-1][:6]}"
    return {
        "decision_id": decision_id,
        "trigger_type": trigger_type,
        "decision": decision,
        "reason": reason,
        "skip_perception": skip_perception,
        "skip_planning": skip_planning,
        "cost_hint": cost_hint,
        "agents_to_invoke": agents_to_invoke or [],
        "fallback_if_failure": fallback_if_failure,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
