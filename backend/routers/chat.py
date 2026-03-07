import asyncio
import os
import json
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.supabase_client import supabase

router = APIRouter()

# Lazy init Gemini client
_api_key = None
_client = None

def get_gemini_client():
    global _client, _api_key
    if _client is not None:
        return _client
    _api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("backend_API_KEY", "")
    if not _api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")
    from google import genai
    _client = genai.Client(api_key=_api_key)
    return _client


ALPHA_VANTAGE_TIMEOUT = 3.0
COMMODITIES = ["COPPER", "ALUMINUM", "NATURAL_GAS", "CRUDE_OIL_WTI"]


async def _fetch_one_commodity(client: httpx.AsyncClient, commodity: str, api_key: str) -> tuple:
    """Fetch one commodity; returns (commodity, {price, date}) or (commodity, None)."""
    try:
        resp = await client.get(
            "https://www.alphavantage.co/query",
            params={
                "function": commodity,
                "apikey": api_key,
                "datatype": "json",
            },
            timeout=ALPHA_VANTAGE_TIMEOUT,
        )
        data = resp.json()
        arr = data.get("data", data.get("Time Series (Daily)", data.get("Monthly Time Series", [])))
        if isinstance(arr, dict):
            # Some endpoints return dict of date -> {value}; take latest date
            keys = sorted(arr.keys(), reverse=True)
            if keys:
                latest = arr[keys[0]]
                value = latest.get("value", latest.get("1. open", latest.get("4. close")))
                return (commodity, {"price": value, "date": keys[0]})
            return (commodity, None)
        if isinstance(arr, list) and arr:
            latest = arr[0]
            return (commodity, {"price": latest.get("value"), "date": latest.get("date")})
        return (commodity, None)
    except Exception:
        return (commodity, None)


async def build_chat_context(org_id: str) -> dict:
    """Build context: Supabase (risk_cases, suppliers, inventory, purchase_orders) + commodity prices."""
    risk_res = supabase.table("risk_cases").select("*").order("created_at", desc=True).limit(5).execute()
    supp_res = supabase.table("suppliers").select("*").execute()
    inv_res = supabase.table("inventory").select("*").execute()
    po_res = supabase.table("purchase_orders").select("*").eq("status", "open").execute()

    context = {
        "risk_cases": risk_res.data or [],
        "suppliers": supp_res.data or [],
        "inventory": inv_res.data or [],
        "open_purchase_orders": po_res.data or [],
    }

    commodity_context = {}
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                tasks = [_fetch_one_commodity(client, c, api_key) for c in COMMODITIES]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for r in results:
                    if isinstance(r, tuple) and len(r) == 2 and r[1] is not None:
                        commodity_context[r[0]] = r[1]
                    elif isinstance(r, Exception):
                        print(f"[chat] AlphaVantage fetch failed: {r}")
        except Exception as e:
            print(f"[chat] AlphaVantage fetch failed: {e}")

    context["commodity_prices"] = commodity_context
    return context


def _build_system_prompt(context: dict, org_id: str = "ORG_DEMO") -> str:
    suppliers_str = json.dumps(context.get("suppliers", []), default=str)
    inventory_str = json.dumps(context.get("inventory", []), default=str)
    purchase_orders_str = json.dumps(context.get("open_purchase_orders", []), default=str)
    risk_cases_str = json.dumps(context.get("risk_cases", []), default=str)
    commodity_prices_str = json.dumps(context.get("commodity_prices", {}), default=str)
    
    # Get session summary from manager
    session_summary = ""
    try:
        from agents.manager.session_tracker import get_latest_session_summary, get_session_stats
        summary = get_latest_session_summary(org_id)
        stats = get_session_stats(org_id)
        if summary:
            session_summary = f"\n\n3. SESSION ACTIVITY (what Omni has done today):\n   {summary}"
        elif stats.get("total_pipeline_runs", 0) > 0:
            session_summary = f"\n\n3. SESSION ACTIVITY:\n   Ran {stats['total_pipeline_runs']} pipeline(s), created {stats['total_cases_created']} case(s), {stats['pending_actions']} action(s) pending approval."
    except Exception as e:
        print(f"Error fetching session summary: {e}")

    return f"""You are Omni, an intelligent supply chain assistant for Omni Manufacturing.

You have multiple sources of information:

1. INTERNAL DATA (always check this first for company-specific questions):
   - Suppliers: {suppliers_str}
   - Inventory: {inventory_str}
   - Open Purchase Orders: {purchase_orders_str}
   - Active Risk Cases: {risk_cases_str}
   - Commodity prices (from data feed): {commodity_prices_str}

2. WEB SEARCH (use for market news, geopolitical events, industry trends, commodity analysis, anything requiring current world knowledge):
   - Use Google Search when asked about current events, news, prices, regulations, or anything not in the internal data above.{session_summary}

Rules:
- For questions about OUR suppliers, inventory, orders, risks → use internal data
- For questions about the world (commodity prices, news, regulations, trade policy, geopolitical events) → use web search
- For questions combining both (e.g. "how does the Taiwan situation affect our Taiwan Semiconductor Corp supply?") → use web search for context, internal data for specifics, then synthesize
- For questions like "What has Omni done today?" or "Are there pending approvals?" → use session activity data
- Always be specific — use supplier and material names (e.g. Taiwan Semiconductor Corp, 7nm Silicon Wafer) in answers; you may cite codes (SUPP_044, MAT_001, PO_8821) where useful for traceability
- Keep responses concise but substantive

Good examples:
- "What are our current risks?" → internal data
- "What is the price of aluminum today?" → web search
- "What is happening in Taiwan that could affect our supply chain?" → web search + internal
- "Which of our suppliers are single source?" → internal data
- "What has Omni done today?" → session activity
- "Are there any pending approvals?" → session activity"""


class ChatRequest(BaseModel):
    message: str
    org_id: str = "ORG_DEMO"


@router.post("/chat")
async def chat(request: ChatRequest):
    """Chat with live context (Supabase + commodity prices + session summary) and optional Google Search grounding."""
    try:
        context = await build_chat_context(request.org_id)
        system_prompt = _build_system_prompt(context, org_id=request.org_id)
        user_message = request.message

        client = get_gemini_client()
        from google.genai import types

        # Prefer model that supports Google Search; fallback to flash
        model_name = "gemini-2.0-flash"
        config_kwargs = {}
        try:
            grounding_tool = types.Tool(google_search=types.GoogleSearch())
            config_kwargs["tools"] = [grounding_tool]
        except Exception:
            pass  # no search tool, proceed without

        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
        contents = f"{system_prompt}\n\nUser question: {user_message}"

        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
        except Exception as e1:
            if "not found" in str(e1).lower() or "404" in str(e1):
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=config,
                )
            else:
                raise

        text = response.text if hasattr(response, "text") else (response.candidates[0].content.parts[0].text if response.candidates else "")
        return {"response": text or "No response generated."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
