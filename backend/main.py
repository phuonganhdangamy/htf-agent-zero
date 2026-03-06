from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import agent, erp, webhooks, events, actions, simulate, chat
from backend.services.supabase_client import supabase
from dotenv import load_dotenv

load_dotenv()


def seed_memory_patterns():
    """Ensure default memory pattern exists for Live Simulation / Memory Patterns section."""
    try:
        existing = supabase.table("memory_patterns").select("pattern_id").eq("pattern_id", "PAT_taiwan_strait_001").execute()
        if not existing.data:
            supabase.table("memory_patterns").insert({
                "pattern_id": "PAT_taiwan_strait_001",
                "trigger_conditions": {"event_type": "conflict", "subtype": "geopolitical", "region": "Taiwan"},
                "recommended_actions": [{"action_type": "expedite", "lift": 0.28}, {"action_type": "activate_backup_supplier", "lift": 0.22}],
                "avoid_actions": [{"action_type": "do_nothing", "reason": "high stockout rate historically"}],
                "avg_cost_usd": 32000,
                "avg_loss_prevented_usd": 240000,
                "avg_risk_reduction": 0.34,
                "confidence": 0.78,
                "support_count": 3,
                "last_updated": "2026-03-05T00:00:00Z"
            }).execute()
    except Exception as e:
        print(f"seed_memory_patterns: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_memory_patterns()
    yield


app = FastAPI(title="Omni - Autonomous Supply Chain Agent API", lifespan=lifespan)

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
app.include_router(chat.router, prefix="/api", tags=["Chat"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
