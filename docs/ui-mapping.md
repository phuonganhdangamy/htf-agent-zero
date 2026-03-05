# Omni UI Mapping

This document maps the React frontend UI components to the underlying Supabase database tables and Python backend API routes.

## 1. Dashboard (`/`)
* **Displays**: High-level KPIs and Fleet Map.
* **Component**: `DashboardOverview`
* **Backend Source**: `/api/erp/inventory`, `/api/erp/purchase-orders` (to calculate active counts), and `/api/events` (for map plotting).
* **Database**: `inventory`, `purchase_orders`, `signal_events`

## 2. Events Feed (`/events`)
* **Displays**: Raw, unprocessed intelligence signals gathered by the Perception agents.
* **Component**: `EventsFeed`
* **Backend Source**: `GET /api/events`
* **Database Table**: `signal_events`
* **Agent Flow**: Populated by the `Normalizer Agent` scanning APIs (GDACS, GDELT) and saving them via the `save_signal_events` tool.

## 3. Risk Cases (`/cases`)
* **Displays**: Critical disruptions prioritized by the Reasoning agents.
* **Component**: `RiskCases`
* **Backend Source**: `GET /api/agent/cases` (with Realtime Supabase subscriptions)
* **Database Table**: `risk_cases`
* **Agent Flow**: Populated by the `Scoring Agent` after fusing signals, calculating exposure against BOM/suppliers, and applying `risk_policy.yaml` thresholds.

## 4. Case Detail & Plans (`/cases/:id`)
* **Displays**: Granular exposure details for a specific case and the AI-generated mitigation plans.
* **Component**: `CaseDetail`
* **Database Table**: `risk_cases` (specifically the `exposure` and `alternative_plans` JSONB columns)
* **Agent Flow**: Created by the `Plan Generator` and `Scenario Simulator` using the `action_library.yaml` catalog.

## 5. Actions & Approval (`/actions`)
* **Displays**: Pending ERP modification payloads requiring human sign-off.
* **Component**: `ActionsApproval`
* **Backend Source**: `GET /api/actions/proposals` and `PUT /api/actions/approve/:id`
* **Database Table**: `change_proposals`
* **Agent Flow**: Created by the `Change Proposal Agent`. The frontend sends the "Approve" signal which unblocks the `Commit Agent` in the Python backend to execute the API calls.

## 6. Omni Agent Panel (Interactive Chat)
* **Displays**: The conversational interface to trigger analytical pipelines manually.
* **Component**: `OmniAgentPanel`
* **Backend Source**: `POST /api/agent/analyze`
* **Agent Flow**: Invokes the `root_agent.py` pipeline (running `async_stream_query` context loop) from Perception all the way down to Reflection.
