from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import agent, erp, webhooks, events, actions, simulate
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Omni - Autonomous Supply Chain Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent.router, prefix="/api/agent", tags=["Agent"])
app.include_router(erp.router, prefix="/api/erp", tags=["ERP"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(events.router, prefix="/api", tags=["Events"])
app.include_router(actions.router, prefix="/api", tags=["Actions"])
app.include_router(simulate.router, prefix="/api/simulate", tags=["Simulate"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
