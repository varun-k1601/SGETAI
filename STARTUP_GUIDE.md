# 🚀 RAG SYSTEM - STARTUP GUIDE

**Start all services and test the RAG system in under 5 minutes!**

---

## 📋 PREREQUISITES

✅ Node.js >= 18 installed  
✅ Ollama installed (from https://ollama.ai)  
✅ Models pulled:
```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

---

## 🎯 STARTUP SEQUENCE

### OPTION 1: Automatic (Recommended)

#### Windows:
```bash
# Double-click this file:
START_ALL_SERVICES.bat
```

It will show you instructions for starting services in 3 terminals.

#### Mac/Linux:
```bash
chmod +x START_ALL_SERVICES.sh
./START_ALL_SERVICES.sh
```

---

### OPTION 2: Manual (Step-by-Step)

Open **3 separate terminals** and run these commands:

#### Terminal 1: Ollama Server
```bash
ollama serve
```

**Expected Output:**
```
time=2026-06-20T... level=INFO msg="Listening on" address=[::]:11434
time=2026-06-20T... level=INFO msg="Listening on" address=127.0.0.1:11434
```

✅ Ollama is running on **http://localhost:11434**

---

#### Terminal 2: Backend Server
```bash
cd backend
npm run dev
```

**Expected Output:**
```
> sgetai-backend@1.0.0 dev
> nodemon src/server.js

[nodemon] 3.0.1
[nodemon] to restart at any time, type `rs`
[nodemon] watching path(s): src/**/*
[nodemon] watching extensions: js,json

SGETAI backend listening on port 5000
```

✅ Backend is running on **http://localhost:5000**

---

#### Terminal 3: Frontend Server
```bash
cd frontend
npm run dev
```

**Expected Output:**
```
  VITE v7.1.12  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

✅ Frontend is running on **http://localhost:5173**

---

## 🔍 VERIFY SERVICES ARE RUNNING

### Check Backend:
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "success": true,
  "message": "SGETAI backend foundation is healthy.",
  "services": {
    "database": "connected",
    "ai": "configured",
    "supabase": "unknown"
  }
}
```

### Check Ollama:
```bash
curl http://localhost:11434/api/tags
```

Expected response:
```json
{
  "models": [
    {"name": "nomic-embed-text:latest"},
    {"name": "qwen2.5:7b:latest"}
  ]
}
```

### Check Frontend:
```bash
curl http://localhost:5173
```

Should return HTML content (frontend is running)

---

## 🧪 TEST THE RAG SYSTEM

### Step 1: Open Frontend
```
Browser: http://localhost:5173/ats-checker
```

You should see the "Resume and target job" form.

### Step 2: Upload Resume
1. Click "Upload resume"
2. Select a PDF or DOCX file (sample-resume.pdf in the project root)
3. Or paste resume text in the textarea

### Step 3: Enable RAG Analysis
```
☑ Use RAG AI Analysis (experimental)
```

This checkbox is NEW - it activates the RAG system.

### Step 4: Select Job
Either:
- Search for jobs and click one
- Or paste a job description in the textarea

### Step 5: Run Analysis
```
Click: "Analyze with RAG"
```

### Step 6: Wait for Results
⏱️ **Expected time:** 20-40 seconds

You'll see:
- Loading spinner
- "Analyzing resume with Ollama AI..."

### Step 7: View Results
Once complete, you'll see:

```
┌─────────────────────────────────────┐
│ MATCH SCORE: 87/100 [Strong fit]    │
├─────────────────────────────────────┤
│ SKILLS MATCH                        │
│ ✓ Found: Python, React (8/10)       │
│ ✗ Missing: Kubernetes (2/10)        │
│ Match: 80%                          │
├─────────────────────────────────────┤
│ STRENGTHS                           │
│ • 6+ years backend experience       │
│ • Proven team leadership            │
├─────────────────────────────────────┤
│ WEAKNESSES                          │
│ • Limited DevOps experience         │
├─────────────────────────────────────┤
│ RECRUITER SUMMARY                   │
│ This candidate is an excellent      │
│ match with deep backend expertise...│
└─────────────────────────────────────┘
```

✅ **SUCCESS!** RAG system is working!

---

## 🔧 TROUBLESHOOTING

### Problem: Ollama service unavailable

**Error in Frontend:**
```
"Ollama service may be unavailable"
```

**Solution:**
1. Verify `ollama serve` is running in Terminal 1
2. Check: `curl http://localhost:11434/api/tags`
3. If not running, restart Ollama:
   ```bash
   # Kill Ollama process
   # Then run: ollama serve
   ```

---

### Problem: Backend won't start

**Error:**
```
Error: listen EADDRINUSE :::5000
```

**Solution:**
Port 5000 is already in use. Either:
1. Kill the process using port 5000:
   ```bash
   # Find process ID:
   netstat -tulpn | grep 5000
   kill -9 <PID>
   ```
2. Or change PORT in `backend/.env`:
   ```env
   PORT=5001
   ```

---

### Problem: Frontend not loading

**Error:**
```
ERR! exit status 1
```

**Solution:**
1. Ensure you're in the `frontend` directory
2. Check Node version: `node --version` (should be >= 18)
3. Clear cache: `rm -rf node_modules && npm install`
4. Restart: `npm run dev`

---

### Problem: Models not found

**Error from Ollama:**
```
Error: model not found
```

**Solution:**
Pull missing models:
```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

---

### Problem: Analysis takes too long (>1 minute)

**Causes:**
- CPU-based inference (normal for 7B models)
- Low RAM
- Ollama server overloaded

**Solutions:**
1. Try faster model:
   ```env
   OLLAMA_ANALYSIS_MODEL=mistral:7b
   ```
2. Enable GPU acceleration (if available)
3. Close other applications

---

## 📊 SERVICE STATUS DASHBOARD

Create a quick status check:

```bash
# Check all services
echo "=== SERVICE STATUS ===" && \
echo "Ollama: $(curl -s http://localhost:11434/api/tags | jq '.models | length') models" && \
echo "Backend: $(curl -s http://localhost:5000/health | jq '.services.database')" && \
echo "Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
```

---

## 🎯 NEXT STEPS AFTER STARTUP

### 1. Verify Everything Works
- [ ] Ollama server is running
- [ ] Backend API is responding
- [ ] Frontend is loading
- [ ] Can upload resume
- [ ] RAG analysis completes

### 2. Test Various Scenarios
- [ ] Upload PDF resume
- [ ] Upload DOCX resume
- [ ] Paste resume text
- [ ] Select different jobs
- [ ] Test error handling (stop Ollama and try)

### 3. Monitor Logs
- Watch Terminal 1 (Ollama) for embedding requests
- Watch Terminal 2 (Backend) for API calls
- Watch Terminal 3 (Frontend) for build messages

### 4. Test with Real Data
- Upload actual resumes
- Test with different job descriptions
- Verify match scores make sense
- Check strengths/weaknesses accuracy

---

## 🚀 PRODUCTION DEPLOYMENT

Once tested locally:

1. **Setup MongoDB Atlas**
   - Create cluster
   - Setup vector index
   - Get connection string
   - Set `MONGO_URI` in `.env`

2. **Setup Production Ollama**
   - Install on production server
   - Configure firewall
   - Setup authentication if exposed

3. **Deploy Backend**
   ```bash
   # Build
   npm run build
   
   # Deploy to server
   # Set environment variables
   # Start service
   npm start
   ```

4. **Deploy Frontend**
   ```bash
   # Build
   npm run build
   
   # Serve dist folder
   # Point domain to frontend
   ```

---

## 📞 SUPPORT

**Something not working?**

1. Check the **Troubleshooting** section above
2. Verify all prerequisites are met
3. Check service logs in each terminal
4. Read `RAG_QUICK_START.md`
5. Review `RAG_IMPLEMENTATION_SUMMARY.md`

---

## ✅ CHECKLIST BEFORE GOING LIVE

- [ ] All 3 services start without errors
- [ ] Can upload and analyze resumes
- [ ] Match scores are reasonable
- [ ] Dark/light theme works
- [ ] Mobile responsive
- [ ] Error handling works (stop Ollama, try again)
- [ ] Documentation reviewed
- [ ] Tests passed
- [ ] No security issues
- [ ] Performance acceptable

---

## 🎉 YOU'RE READY!

Follow the startup sequence above and you'll have the full RAG system running locally in under 5 minutes.

Enjoy! 🚀
