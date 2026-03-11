import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import agent, erp, webhooks, events, actions, simulate, chat, monitoring
from backend.services.supabase_client import supabase
from pathlib import Path
from dotenv import load_dotenv

# Load repo root .env first, then backend/.env so backend-specific (e.g. EMAIL_*) are used
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")


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

    # Run initial monitoring check on startup (uses OMNI_COMPANY_ID)
    try:
        from backend.services.monitoring_service import check_and_alert
        company_id = os.environ.get("OMNI_COMPANY_ID", "ORG_DEMO")
        result = check_and_alert(company_id=company_id)
        print(f"[startup] monitoring check: {result}")
    except Exception as e:
        print(f"[startup] monitoring check failed: {e}")

    # Start background perception polling via manager.
    # Uses manager_service.run_perception_with_manager, which already skips
    # redundant perception runs if fresh data exists (15-minute window).
    async def _perception_scheduler():
        company_id = os.environ.get("OMNI_COMPANY_ID", "ORG_DEMO")
        # Default: every 15 minutes; override with PERCEPTION_INTERVAL_SECONDS.
        try:
            interval = int(os.environ.get("PERCEPTION_INTERVAL_SECONDS", "900"))
        except ValueError:
            interval = 900

        while True:
            try:
                from backend.services.manager_service import run_perception_with_manager
                result = await run_perception_with_manager(company_id=company_id)
                print(f"[perception-scheduler] run_perception_with_manager({company_id}) -> {result.get('status')}")
            except Exception as e:
                print(f"[perception-scheduler] error: {e}")

            await asyncio.sleep(interval)

    asyncio.create_task(_perception_scheduler())

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
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["Monitoring"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
