# 🚀 START RAG SYSTEM NOW

**Models are downloaded!** ✅ Let's get everything running.

---

## 📋 **OPEN 3 POWERSHELL WINDOWS**

### **Window 1: Ollama Server**
```powershell
ollama serve
```

**Expected output:**
```
time=2026-06-20T... level=INFO msg="Listening on" address=[::]:11434
time=2026-06-20T... level=INFO msg="Listening on" address=127.0.0.1:11434
```

✅ **Wait until you see "Listening on 11434"**

---

### **Window 2: Backend Server**
```powershell
cd backend
npm run dev
```

**Expected output:**
```
[nodemon] watching path(s): src/**/*
SGETAI backend listening on port 5000
```

✅ **Wait until you see "listening on port 5000"**

---

### **Window 3: Frontend Server**
```powershell
cd frontend
npm run dev
```

**Expected output:**
```
VITE v7.1.12  ready in 234 ms
➜  Local:   http://localhost:5173/
```

✅ **Wait until you see "http://localhost:5173"**

---

## 🧪 **VERIFY ALL SERVICES**

Once all 3 show "ready" messages, verify in a 4th PowerShell:

```powershell
# Test Ollama
curl http://localhost:11434/api/tags

# Test Backend
curl http://localhost:5000/health

# Test Frontend
curl http://localhost:5173
```

All should return data ✅

---

## 🎯 **TEST RAG SYSTEM**

Open browser:
```
http://localhost:5173/ats-checker
```

You should see:
✅ Upload resume form
✅ Search jobs field
✅ **"Use RAG AI Analysis" checkbox** (NEW!)
✅ Analyze button

---

## 📝 **FULL WORKFLOW**

1. **Upload Resume**
   - Click "Upload resume"
   - Select PDF or DOCX file

2. **Enable RAG**
   - ☑ Check "Use RAG AI Analysis"

3. **Select Job**
   - Search for a job, OR
   - Paste job description

4. **Analyze**
   - Click "Analyze with RAG"

5. **Wait**
   - ⏱️ 20-40 seconds for results

6. **See Results**
   - Match score (0-100)
   - Skills breakdown
   - Strengths
   - Weaknesses
   - Recruiter summary

---

## 🆘 **IF SOMETHING GOES WRONG**

### Port Already in Use
```powershell
# Kill process using port 5000
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Ollama Not Responding
- Make sure `ollama serve` is running in Window 1
- Try: `curl http://localhost:11434/api/tags`

### Frontend Won't Load
- Verify you're in `frontend` directory
- Check: `npm run dev` output for errors

### Backend Error
- Verify MongoDB running locally, OR
- Check `.env` has `MONGO_URI` set

---

## ✅ **CHECKLIST**

- [ ] All 3 PowerShell windows open
- [ ] All 3 show "ready" messages
- [ ] Can reach http://localhost:5173/ats-checker
- [ ] Upload resume works
- [ ] "Use RAG AI Analysis" checkbox visible
- [ ] Analysis starts and completes
- [ ] Results display with match score

---

## 📊 **SERVICE PORTS**

| Service | Port | URL |
|---------|------|-----|
| Ollama | 11434 | http://localhost:11434 |
| Backend | 5000 | http://localhost:5000 |
| Frontend | 5173 | http://localhost:5173 |

---

## 🎉 **YOU'RE READY!**

Start the 3 PowerShell commands above and test at:
**http://localhost:5173/ats-checker**

Good luck! 🚀
