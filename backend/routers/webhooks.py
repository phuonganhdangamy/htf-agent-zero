from fastapi import APIRouter, Request

router = APIRouter()

@router.post("/supabase")
async def supabase_webhook(request: Request):
    payload = await request.json()
    # In a full implementation, we could trigger specific agent workflows based on DB changes here
    print(f"Received webhook: {payload}")
    return {"status": "received"}
