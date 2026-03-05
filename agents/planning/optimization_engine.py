from typing import List, Dict, Any

# Pure Python utility, not an ADK LLM agent
def optimize_plans(risk_case: Dict[str, Any], candidate_plans: List[Dict[str, Any]], simulations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Ranks the plans based on a pure formula scoring.
    Score = (expected_loss_prevented * (1 + expected_risk_reduction) * confidence) / (expected_cost + 1)
    """
    ranked = []
    
    # Merge plans with simulations
    for plan in candidate_plans:
        sim = next((s for s in simulations if s.get("plan_id") == plan.get("plan_id")), {})
        
        reduction = sim.get("expected_risk_reduction", 0.0)
        cost = sim.get("expected_cost", 1.0)
        loss_prevented = sim.get("expected_loss_prevented", 0.0)
        confidence = sim.get("confidence", 0.5)
        
        # Simple heuristic utility function
        score = (loss_prevented * (1 + reduction) * confidence) / (cost + 1)
        
        merged_plan = plan.copy()
        merged_plan.update({
            "expected_risk_reduction": reduction,
            "expected_cost": cost,
            "expected_loss_prevented": loss_prevented,
            "confidence": confidence,
            "feasibility_score": score,
        })
        ranked.append(merged_plan)
        
    # Sort descending by feasibility_score
    ranked.sort(key=lambda x: x.get("feasibility_score", 0), reverse=True)
    return ranked
