@echo off
REM RAG System - Start All Services (Windows)

cls
echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  🚀 STARTING RAG SYSTEM SERVICES                       ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo SERVICE PORTS:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo Ollama:   http://localhost:11434
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

echo INSTRUCTIONS:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo Open 3 Command Prompts/PowerShell windows:
echo.
echo Terminal 1 - OLLAMA SERVER:
echo ────────────────────────────
echo   ollama serve
echo   (Listens on http://localhost:11434)
echo.
echo Terminal 2 - BACKEND:
echo ────────────────────────────
echo   cd backend
echo   npm run dev
echo   (Listens on http://localhost:5000)
echo.
echo Terminal 3 - FRONTEND:
echo ────────────────────────────
echo   cd frontend
echo   npm run dev
echo   (Listens on http://localhost:5173)
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo TESTING:
echo ────────────────────────────
echo 1. Wait for all services to start (2-3 minutes)
echo 2. Open http://localhost:5173/ats-checker
echo 3. Upload a resume PDF/DOCX
echo 4. Check "Use RAG AI Analysis"
echo 5. Click "Analyze with RAG"
echo 6. Wait 20-40 seconds for results
echo.
echo HELP:
echo ────────────────────────────
echo • Ollama not starting? Download from https://ollama.ai
echo • Backend error? Check MONGO_URI in backend/.env
echo • Frontend not loading? Ensure npm run dev started successfully
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
pause
