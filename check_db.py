import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from backend.services.supabase_client import supabase

async def check():
    try:
        res = supabase.table("risk_cases").select("id").limit(1).execute()
        print("Table 'risk_cases' exists!")
    except Exception as e:
        print("Error checking table:", e)

if __name__ == "__main__":
    asyncio.run(check())
