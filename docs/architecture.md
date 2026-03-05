# Omni Agent Architecture

## High-Level Pipeline

Omni consists of five primary agent layers, implemented via the Google Gen AI SDK (ADK). The system continuously polls for external disruptions, reasons about supply chain exposure, generates mitigation plans, and stages ERP changes for human approval.

```mermaid
graph TD
    A[Mock ERP Database] -->|Realtime Webhooks| B(Event Trigger)
    B --> C{Perception Layer}
    
    subgraph 1. Perception Layer
    C1[Normalizer Agent]
    C2[GDELT Tool]
    C3[GDACS Tool]
    C4[OpenWeather Tool]
    C --> C1
    C1 --> C2 & C3 & C4
    C1 -->|Outputs| D[Signal Events]
    end

    D --> E{Reasoning Layer}
    subgraph 2. Reasoning Layer
    E1[Cluster Agent]
    E2[Exposure Agent]
    E3[Hypothesis Agent]
    E4[Scoring Agent]
    E --> E1 & E2
    E1 & E2 --> E3 --> E4
    E4 -->|Outputs| F[Risk Cases]
    end

    F --> G{Planning Layer}
    subgraph 3. Planning Layer
    G1[Plan Generator]
    G2[Scenario Simulator]
    G3[Optimization Engine]
    G4[Execution Planner]
    G --> G1 --> G2 --> G3 --> G4
    G4 -->|Outputs| H[Candidate Plans]
    end

    H --> I{Action Layer}
    subgraph 4. Action Layer
    I1[Change Proposal Agent]
    I2[Drafting Agent]
    I3[Approval Gate]
    I4[Commit Agent]
    I5[Verification Agent]
    I6[Audit Agent]
    
    I --> I1 --> I2 --> I3
    I3 -->|HITL Approval| I4 --> I5 --> I6
    end
    
    I6 -->|Updates| A
    I6 --> J{Reflection Layer}
    
    subgraph 5. Reflection Layer
    J1[Outcome Evaluator]
    J2[Lesson Extractor]
    J --> J1 --> J2
    end
    
    J2 -->|Updates| K[(Vector Memory)]
    K -.->|Retrieval| G1
```

## Agent Responsibilities

1. **Perception**: Interacts with the outside world via `FunctionTool` calls to public APIs (OpenWeather, GDACS, GDELT). Normalizes disparate news into standard `SignalEvent` models stored in Supabase.
2. **Reasoning**: Fuses multiple `SignalEvents` into distinct `EventClusters`. Maps these clusters to internal ERP entities (Suppliers, Routes, Facilities) to calculate exposure. Evaluates a mathematical risk score based on the `/agents/reasoning/risk_policy.yaml`.
3. **Planning**: Uses the `/agents/planning/action_library.yaml` to propose concrete mitigation strategies (e.g., Expedite Air Freight, Reroute Shipment). Simulates the cost/benefit of each plan and selects a recommended course of action.
4. **Action**: Translates the high-level plan into a literal JSON diff against the ERP API schema (`ChangeProposal`). Blocks on human-in-the-loop (HITL) authorization. If approved, executes the change, verifies the state, and writes to an immutable Audit Log.
5. **Reflection**: Compares the predicted risk reduction to the actual observed reality. Extracts generalized patterns (e.g., "Air freight during typhoons is less effective") and stores them in Supabase, which the Planning layer consults on future runs.
