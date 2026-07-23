@echo off
REM Ollama Setup Script for Windows
REM This script will pull the required models for RAG system

cls
echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  🚀 OLLAMA MODEL SETUP                                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if Ollama is installed
echo Checking if Ollama is installed...
ollama --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ ERROR: Ollama is not installed!
    echo.
    echo Please install Ollama first:
    echo 1. Go to: https://ollama.ai
    echo 2. Click "Download" button for Windows
    echo 3. Run the installer
    echo 4. Restart your computer
    echo 5. Run this script again
    echo.
    pause
    exit /b 1
)

echo ✅ Ollama found!
echo.

REM Check current models
echo Checking installed models...
ollama list
echo.

REM Pull Model 1: Embedding
echo ╔════════════════════════════════════════════════════════╗
echo ║  DOWNLOADING: nomic-embed-text (275 MB)               ║
echo ║  This will take 1-2 minutes...                         ║
echo ╚════════════════════════════════════════════════════════╝
echo.
ollama pull nomic-embed-text
if %errorlevel% neq 0 (
    echo ❌ Failed to pull nomic-embed-text
    pause
    exit /b 1
)
echo ✅ nomic-embed-text downloaded!
echo.

REM Pull Model 2: LLM Analysis
echo ╔════════════════════════════════════════════════════════╗
echo ║  DOWNLOADING: qwen2.5:7b (5 GB)                       ║
echo ║  This will take 5-10 minutes...                        ║
echo ║  Please be patient!                                    ║
echo ╚════════════════════════════════════════════════════════╝
echo.
ollama pull qwen2.5:7b
if %errorlevel% neq 0 (
    echo ❌ Failed to pull qwen2.5:7b
    echo.
    echo Try alternative model (smaller):
    echo   ollama pull mistral:7b
    pause
    exit /b 1
)
echo ✅ qwen2.5:7b downloaded!
echo.

REM Verify installation
echo ╔════════════════════════════════════════════════════════╗
echo ║  ✅ SETUP COMPLETE!                                    ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo Installed models:
ollama list
echo.
echo ✅ You can now use RAG system!
echo.
echo NEXT STEPS:
echo ────────────────────────────────────────────────────────
echo 1. Open Terminal 1:
echo    ollama serve
echo.
echo 2. Open Terminal 2:
echo    cd backend && npm run dev
echo.
echo 3. Open Terminal 3:
echo    cd frontend && npm run dev
echo.
echo 4. Open browser:
echo    http://localhost:5173/ats-checker
echo.
pause
