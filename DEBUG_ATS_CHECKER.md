# 🔧 DEBUG: ATS Checker Not Working

## ❌ PROBLEM DIAGNOSIS

**Services Status:**
- ❌ Ollama - NOT RUNNING
- ❌ Backend - NOT RUNNING  
- ❌ Frontend - NOT RUNNING

**Error:** All services must be running for ATS checker to work!

---

## ✅ SOLUTION: START ALL SERVICES

### Step 1: Start Ollama (Terminal 1)
```bash
ollama serve
```

**Wait for:**
```
time=2026-06-20T... level=INFO msg="Listening on" address=[::]:11434
```

### Step 2: Start Backend (Terminal 2)
```bash
cd backend
npm run dev
```

**Wait for:**
```
SGETAI backend listening on port 5000
```

### Step 3: Start Frontend (Terminal 3)
```bash
cd frontend
npm run dev
```

**Wait for:**
```
➜  Local:   http://localhost:5173/
```

---

## 🔍 VERIFY SERVICES

Once all 3 are running, verify them:

### Check 1: Ollama Health
```bash
curl http://localhost:11434/api/tags
```
✅ Should return JSON with list of models

### Check 2: Backend Health
```bash
curl http://localhost:5000/health
```
✅ Should return:
```json
{
  "success": true,
  "message": "SGETAI backend foundation is healthy.",
  "services": { ... }
}
```

### Check 3: Frontend Health
```bash
curl http://localhost:5173
```
✅ Should return HTML (200 OK)

---

## 🎯 THEN TEST ATS CHECKER

Once all services are running:

1. Open: **http://localhost:5173/ats-checker**
2. Upload a resume PDF/DOCX
3. ☑ Check "Use RAG AI Analysis"
4. Select job or paste description
5. Click "Analyze with RAG"
6. Wait 20-40 seconds
7. ✅ See results!

---

## 🚨 COMMON ISSUES

### Issue 1: "Cannot GET /ats-checker"
**Cause:** Frontend not running on 5173  
**Fix:** Start `npm run dev` in frontend directory

### Issue 2: "Ollama service unavailable" error
**Cause:** Ollama not running  
**Fix:** Run `ollama serve` in separate terminal

### Issue 3: Analysis hangs/takes forever
**Cause:** Ollama not responding or models not loaded  
**Fix:** 
- Verify models: `ollama list`
- Restart: Kill ollama and run `ollama serve` again

### Issue 4: Backend won't start (Port 5000 in use)
**Cause:** Another service using port 5000  
**Fix:** Kill the process or use different port

### Issue 5: npm install errors
**Cause:** Dependencies not installed  
**Fix:** 
```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

---

## 📋 COMPLETE STARTUP CHECKLIST

- [ ] Ollama installed from https://ollama.ai
- [ ] Models pulled:
  - [ ] `ollama pull nomic-embed-text`
  - [ ] `ollama pull qwen2.5:7b`
- [ ] Terminal 1: `ollama serve` running
- [ ] Terminal 2: `cd backend && npm run dev` running
- [ ] Terminal 3: `cd frontend && npm run dev` running
- [ ] All 3 services show "ready" messages
- [ ] Browser: http://localhost:5173/ats-checker loads
- [ ] Can upload resume
- [ ] RAG checkbox visible
- [ ] Analysis completes without errors

---

## 🧪 QUICK TEST

Run these 3 commands in a new terminal to verify all services:

```bash
# Test Ollama
curl -s http://localhost:11434/api/tags | grep -q "nomic-embed-text" && echo "✅ Ollama OK" || echo "❌ Ollama FAILED"

# Test Backend
curl -s http://localhost:5000/health | grep -q "healthy" && echo "✅ Backend OK" || echo "❌ Backend FAILED"

# Test Frontend  
curl -s http://localhost:5173 | grep -q "html" && echo "✅ Frontend OK" || echo "❌ Frontend FAILED"
```

**All 3 should show ✅ before testing ATS checker**

---

## 📱 WHAT SHOULD HAPPEN

### When services are running correctly:

**Browser (http://localhost:5173/ats-checker):**
```
┌─────────────────────────────────┐
│ Resume and target job           │
│                                 │
│ Upload resume [Choose file]     │
│                                 │
│ Or paste resume text            │
│ [textarea with placeholder]     │
│                                 │
│ Search jobs                     │
│ [input field]                   │
│                                 │
│ Location                        │
│ [input field]                   │
│                                 │
│ ☑ Use RAG AI Analysis           │
│                                 │
│ [Analyze with RAG] button       │
└─────────────────────────────────┘
```

### When you click "Analyze with RAG":

**Terminal 1 (Ollama):**
```
Shows embedding generation
Shows LLM generation requests
```

**Terminal 2 (Backend):**
```
POST /api/resume-rag/upload 200
POST /api/resume-rag/quick-analyze 200
```

**Browser:**
```
Loading spinner...
"Analyzing resume with Ollama AI..."
[waiting 20-40 seconds]
...Results appear...
```

---

## 🆘 STILL NOT WORKING?

1. **Check all 3 terminals** - All must show "ready" messages
2. **Run the quick test above** - All 3 must show ✅
3. **Check browser console** - Press F12, look for errors
4. **Check terminal errors** - Any red text in terminals?
5. **Restart everything** - Kill all 3, start fresh
6. **Check ports:**
   ```bash
   # Make sure ports are free
   netstat -tuln | grep -E "5000|5173|11434"
   ```

---

## 📞 SUPPORT

- **Quick Start:** Read `RAG_QUICK_START.md`
- **Detailed Guide:** Read `STARTUP_GUIDE.md`
- **Validation:** Run `node backend/src/scripts/validateRagSetup.js`

---

## ✅ YOU'RE DONE!

Once all 3 services show "ready", the ATS checker will work perfectly!

Go to: **http://localhost:5173/ats-checker**

Enjoy! 🚀
