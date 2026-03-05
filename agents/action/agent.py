from google.adk.agents import SequentialAgent
from agents.action.drafting_agent import build_drafting_agent
from agents.action.change_proposal_agent import build_change_proposal_agent
from agents.action.approval_agent import build_approval_agent
from agents.action.commit_agent import build_commit_agent
from agents.action.verification_agent import build_verification_agent
from agents.action.audit_agent import build_audit_agent

def build_action_coordinator() -> SequentialAgent:
    drafting_agent = build_drafting_agent()
    change_proposal_agent = build_change_proposal_agent()
    approval_agent = build_approval_agent()
    commit_agent = build_commit_agent()
    verification_agent = build_verification_agent()
    audit_agent = build_audit_agent()
    
    pipeline = SequentialAgent(
        id="action_coordinator",
        name="Action Coordinator",
        description="Coordinates the drafting, approval, commit, verification, and auditing of supply chain actions.",
        agents=[
            change_proposal_agent,
            drafting_agent,
            approval_agent,
            commit_agent,
            verification_agent,
            audit_agent
        ]
    )
    
    return pipeline
