import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from backend.services.agent_runner import run_pipeline

async def main():
    res = await run_pipeline("C-001", "test trigger", {})
    print("RESULT:", res)

if __name__ == "__main__":
    asyncio.run(main())
