from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class DraftArtifact(BaseModel):
    id: Optional[str] = None
    artifact_id: str
    action_run_id: Optional[str] = None
    type: Optional[str] = None
    preview: Optional[str] = None
    structured_payload: Optional[Dict[str, Any]] = None
    evidence_refs: Optional[List[str]] = None
    status: Optional[str] = 'pending'

class ChangeProposal(BaseModel):
    id: Optional[str] = None
    proposal_id: str
    action_run_id: Optional[str] = None
    system: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    diff: Optional[Dict[str, Any]] = None
    risk: Optional[Dict[str, Any]] = None
    approved_by: Optional[str] = None
    status: Optional[str] = 'pending'

class ActionRun(BaseModel):
    id: Optional[str] = None
    action_run_id: str
    case_id: Optional[str] = None
    plan_id: Optional[str] = None
    status: Optional[str] = 'drafted'
    steps: Optional[List[Dict[str, Any]]] = None
    approvals: Optional[List[Dict[str, Any]]] = None
    audit_refs: Optional[List[str]] = None
