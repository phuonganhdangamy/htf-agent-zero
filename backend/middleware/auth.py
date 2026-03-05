from fastapi import Request, HTTPException
import os

async def verify_api_key(request: Request):
    api_key_header = request.headers.get("X-API-Key")
    expected_api_key = os.environ.get("backend_API_KEY", "dev-key")
    if api_key_header != expected_api_key:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
