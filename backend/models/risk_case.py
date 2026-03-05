from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class RiskCase(BaseModel):
    id: Optional[str] = None
    case_id: str
    cluster_id: Optional[str] = None
    risk_category: Optional[str] = None
    headline: Optional[str] = None
    status: Optional[str] = 'open'
    scores: Optional[Dict[str, Any]] = None
    exposure: Optional[Dict[str, Any]] = None
    hypotheses: Optional[Dict[str, Any]] = None
    recommended_plan: Optional[str] = None
    alternative_plans: Optional[List[Dict[str, Any]]] = None
    expected_risk_reduction: Optional[float] = None
    expected_cost: Optional[float] = None
    expected_loss_prevented: Optional[float] = None
    execution_steps: Optional[List[Dict[str, Any]]] = None
