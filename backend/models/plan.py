from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class CandidatePlan(BaseModel):
    plan_id: str
    plan_type: str
    steps: List[str]
    expected_impact: str
    feasibility_score: float
    tradeoffs: List[str]

class SimulationResult(BaseModel):
    plan_id: str
    expected_risk_reduction: float
    expected_cost: float
    expected_loss_prevented: float
    confidence: float
