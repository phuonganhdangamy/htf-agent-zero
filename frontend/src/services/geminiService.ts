import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.GOOGLE_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const COMPANY_PROFILE = {
    company_name: "Omni Manufacturing",
    industry: "electronics assembly",
    risk_appetite: "medium",
    fill_rate_target: 0.95,
    cost_cap_usd: 50000,
};

export const SUPPLY_CHAIN_SNAPSHOT = {
    suppliers: [
        { id: "SUPP_044", supplier_name: "Taiwan Semiconductor Corp", location: "Kaohsiung, Taiwan", materials: "7nm Silicon Wafer, Mold Compound", criticality_score: 92, single_source: true, lead_time_days: 30 },
        { id: "SUPP_012", supplier_name: "Korea Tech Solutions", location: "South Korea", materials: "7nm Silicon Wafer, Wire Bond Gold", backup_supplier: true, lead_time_days: 60 },
        { id: "SUPP_021", supplier_name: "Japan Electronics", location: "Japan", materials: "Organic Substrate, Wire Bond Gold, EUV Photoresist", backup_supplier: true, lead_time_days: 45 },
    ],
    facilities: [
        { id: "FAC_DE_01", location: "Germany", type: "assembly plant" },
        { id: "DC_DE_01", location: "Germany", type: "warehouse", inventory_days_remaining: 4.2, safety_stock_days: 10 },
    ],
    product: { id: "PROD_001", product_name: "Premium Smartphone Model X", margin: "38%", priority: "high" },
    materials: ["7nm Silicon Wafer", "Organic Substrate", "Wire Bond Gold", "Mold Compound", "EUV Photoresist"],
    transport_route: "Taiwan → Germany (sea)",
    transit_time_days: 14,
    open_purchase_orders: [
        { id: "PO_8821", eta: "2026-03-20", material: "7nm Silicon Wafer" },
        { id: "PO_8822", eta: "2026-04-05", material: "7nm Silicon Wafer" },
    ],
};

export async function runPerceptionAgent() {
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not set in environment or .env file");
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Simulate a global disruption signal relevant to microchip suppliers in Taiwan, South Korea, or Japan. Output a SignalEvent JSON.",
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    event_id: { type: Type.STRING },
                    event_type: { type: Type.STRING },
                    location: { type: Type.STRING },
                    severity_score: { type: Type.NUMBER },
                    confidence_score: { type: Type.NUMBER },
                    evidence_links: { type: Type.ARRAY, items: { type: Type.STRING } },
                    summary: { type: Type.STRING },
                    reasoning: { type: Type.STRING, description: "Short explanation of why this event was flagged." }
                },
                required: ["event_id", "event_type", "location", "severity_score", "confidence_score", "evidence_links", "summary", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text || "{}");
}

export async function runReasoningAgent(signalEvent: any) {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analyze this SignalEvent: ${JSON.stringify(signalEvent)}. Determine exposure for Omni Manufacturing. Risk formula: risk_score = probability × exposure × impact. Output a RiskCase JSON.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    case_id: { type: Type.STRING },
                    event_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                    affected_assets: { type: Type.ARRAY, items: { type: Type.STRING } },
                    probability_score: { type: Type.NUMBER },
                    impact_score: { type: Type.NUMBER },
                    risk_score: { type: Type.NUMBER },
                    explanation: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                },
                required: ["case_id", "event_ids", "affected_assets", "probability_score", "impact_score", "risk_score", "explanation", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text || "{}");
}

export async function runPlanningAgent(riskCase: any) {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate mitigation strategies for this RiskCase: ${JSON.stringify(riskCase)}. Use the Supply Chain Snapshot: ${JSON.stringify(SUPPLY_CHAIN_SNAPSHOT)}. Output PlanOptions JSON.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    plans: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                plan_id: { type: Type.STRING },
                                plan_type: { type: Type.STRING },
                                steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                                estimated_cost: { type: Type.NUMBER },
                                expected_risk_reduction: { type: Type.NUMBER }
                            },
                            required: ["plan_id", "plan_type", "steps", "estimated_cost", "expected_risk_reduction"]
                        }
                    },
                    reasoning: { type: Type.STRING }
                },
                required: ["plans", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text || "{}");
}

export async function runActionAgent(planOptions: any) {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Choose the best plan from: ${JSON.stringify(planOptions)}. Cost cap is ${COMPANY_PROFILE.cost_cap_usd}. Output ActionProposal JSON.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    action_id: { type: Type.STRING },
                    plan_id: { type: Type.STRING },
                    action_type: { type: Type.STRING },
                    description: { type: Type.STRING },
                    status: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                },
                required: ["action_id", "plan_id", "action_type", "description", "status", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text || "{}");
}

export async function runReflectionAgent(actionProposal: any, riskCase: any) {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Evaluate the effectiveness of this action: ${JSON.stringify(actionProposal)} against this risk: ${JSON.stringify(riskCase)}. Output OutcomeEvaluation JSON.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    prediction_accuracy: { type: Type.NUMBER },
                    outcome: { type: Type.STRING },
                    root_cause: { type: Type.STRING },
                    lessons_learned: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                },
                required: ["prediction_accuracy", "outcome", "root_cause", "lessons_learned", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text || "{}");
}
