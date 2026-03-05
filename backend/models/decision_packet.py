from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class DecisionPacket(BaseModel):
    id: Optional[str] = None
    packet_id: str
    case_id: Optional[str] = None
    decision_mode: Optional[str] = None
    risk_summary: Optional[Dict[str, Any]] = None
    constraints: Optional[Dict[str, Any]] = None
    authorized_actions: Optional[List[str]] = None
    requires_approval_for: Optional[List[str]] = None
    escalation_owner: Optional[str] = None
    approval_expiry_hours: Optional[int] = 2
