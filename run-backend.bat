@echo off
cd /d "%~dp0"
if exist venv\Scripts\activate.bat (
  call venv\Scripts\activate.bat
) else (
  echo Create venv first: python -m venv venv
  echo Then: pip install -r requirements.txt
  pause
  exit /b 1
)
echo Starting backend on http://localhost:8000
python -m uvicorn backend.main:app --reload --port 8000
pause
