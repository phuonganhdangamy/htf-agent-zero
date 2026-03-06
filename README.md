# Omni: Autonomous Supply Chain Agent

Omni is an agentic AI system designed to monitor global supply chain disruptions, simulate risk scenarios, and autonomously propose/execute mitigation strategies within an ERP system.

## Current State of the Repository
The repository is heavily scaffolded and successfully runs the foundational infrastructure:

1. **Frontend (React / Vite + Tailwind + TypeScript)**
   - Located in `/frontend`.
   - UI views are built for the Dashboard, Risk Cases, Event Feed, and Action Approvals.
   - Connected to a Supabase Cloud database via `supabase-js`.
   - Connects to the local Python backend API via Axios.

2. **Backend (Python / FastAPI)**
   - Located in `/backend` and `/omni/backend`.
   - Main entry point is `backend/main.py` which runs on `localhost:8000`.
   - Setup to handle API routes for `/api/agent/run` and ERP mock endpoints.
   - Connected to Supabase via `supabase` Python client.

3. **Database (Supabase / PostgreSQL)**
   - Schema defined in `/database/schema.sql` (Tables: `risk_cases`, `action_runs`, `change_proposals`, etc.).
   - Initial demo data defined in `/database/seed.sql`.

4. **Agent Infrastructure (Google ADK)**
   - Located in `/agents` (`perception`, `reasoning`, `planning`, `action`, `reflection`, `memory`).
   - The various sub-agents are defined and registered with `@FunctionTool` to handle specific tasks (e.g. `gdelt`, `open_weather`, `commit_agent`).

## Current Problems & Blockers (Handoff Notes)
**The core multi-agent reasoning pipeline is currently failing to execute autonomously.**

1. **Agent Handoff & Context Passing (`root_agent.py`)**
   - The primary issue lies in `agents/root_agent.py`. The `google-adk` pipeline (`SequentialAgent`) fails to correctly run through all 5 layers (`perception -> reasoning -> planning -> action -> reflection`).
   - Currently, the actual ADK trigger call is **commented out** (`# res = await root_agent.async_stream_query(...)`). 
   - Instead, the backend is hardcoded with a mock script that directly forces static JSON data into Supabase (mocking a "Risk Case" and "Change Proposal") so that the React frontend has something to display.

2. **Tool Execution within Agents**
   - We recently fixed a syntax error where Google ADK was failing due to `@FunctionTool()` instead of `@FunctionTool` across all agent tools.
   - The next developer needs to make sure the LLM is actually utilizing these tools at run-time and feeding the outputs into the next agent in the sequence.

## Next Steps for the Next Developer
1. **Remove Mock Data:** Open `agents/root_agent.py` and remove the temporary Supabase `insert` statements currently simulating the pipeline flow.
2. **Wire the ADK Agents Together:** Fix the actual `root_agent.async_stream_query()` call or `run()` execution. Ensure that when `company_id` and `trigger` are passed in, the `SequentialAgent` correctly initializes the Perception sub-agent, passes output to Reasoning, then to Planning, etc.
3. **Debug Tool Calling:** Watch the Python terminal output (`uvicorn`) as the ADK pipeline runs to ensure the LLMs successfully use `supabase.table()` reads/writes within the agent tools (e.g., `agents/reasoning/agent.py`).
4. **Context Propagation:** Validate that the shared state / scratchpad correctly shares information like `case_id` or `proposal_id` from the Reasoning agent over to the Action agent so that the database records link properly.

## Running the Application Locally

You need **two terminals**: one for the backend (port 8000) and one for the frontend. **Run Cycle** in Live Simulation calls `POST http://localhost:8000/api/agent/run` — if you see `ERR_CONNECTION_REFUSED`, start the backend first.

**Backend (Terminal 1):**
```bash
# From repo root. Use a venv so uvicorn is available:
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate # macOS/Linux
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```
Leave this running. You should see `Uvicorn running on http://127.0.0.1:8000`.

**Frontend (Terminal 2):**
```bash
cd frontend
npm install
npm run dev
```
*(Ensure `frontend/.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_API_URL=http://localhost:8000` if your API is elsewhere.)*