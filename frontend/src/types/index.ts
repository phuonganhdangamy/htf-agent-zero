export interface DisruptionEvent {
    id: string;
    event_id: string;
    event_type: string;
    subtype?: string;
    country: string;
    region?: string;
    headline: string;
    severity_score: number;
    confidence_score: number;
    created_at: string;
}

export interface RiskCase {
    id: string;
    case_id: string;
    risk_category: string;
    headline: string;
    status: string;
    expected_risk_reduction?: number;
    expected_cost?: number;
    expected_loss_prevented?: number;
    exposure?: any;
    alternative_plans?: any[];
    created_at: string;
}

export interface ChangeProposal {
    id: string;
    proposal_id: string;
    action_run_id: string;
    system: string;
    entity_type: string;
    entity_id: string;
    diff: any;
    status: string;
    created_at: string;
}
