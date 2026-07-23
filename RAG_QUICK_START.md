# RAG Resume Analysis - Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Install Ollama (2 minutes)

1. Download from https://ollama.ai
2. Install and run
3. Pull models:
```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```
4. Verify it's running:
```bash
curl http://localhost:11434/api/tags
```

### Step 2: Update Backend (2 minutes)

```bash
cd backend

# Install new dependency
npm install axios

# Update .env with Ollama URL (optional if using defaults)
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_EMBEDDING_MODEL=nomic-embed-text
# OLLAMA_ANALYSIS_MODEL=qwen2.5:7b

# Start backend
npm run dev
```

### Step 3: Start Frontend (1 minute)

```bash
cd frontend
npm run dev
```

### Step 4: Test RAG Analysis

1. Go to http://localhost:5173/ats-checker
2. Upload a resume PDF or DOCX
3. Select a job (or paste job description)
4. ✅ **Check the "Use RAG AI Analysis" checkbox** (NEW!)
5. Click "Analyze with RAG"
6. Wait 20-40 seconds for Ollama to process
7. See your match score + detailed breakdown!

---

## 📊 What You'll See

**Match Score** (0-100)
- 80+: Strong fit (green)
- 60-79: Good fit (blue)
- 40-59: Moderate fit (amber)
- <40: Low fit (red)

**Skills Breakdown**
- ✓ Found skills (matching your resume to job requirements)
- ✗ Missing skills (you should add these)
- % Match percentage

**Strengths** - Why you're a good candidate

**Weaknesses** - Areas to improve

**Recruiter Summary** - 2-3 sentence professional assessment

---

## 🔧 Troubleshooting

### "Ollama service unavailable"
```bash
# Make sure Ollama is running
curl http://localhost:11434/api/tags

# If not, restart:
# - Kill Ollama process
# - Run: ollama serve
```

### "Analysis takes too long" (>1 minute)
- Ollama running on CPU: normal, takes 20-40s
- Consider running on GPU (update Ollama)
- Alternative: use `mistral:7b` (faster but less accurate)

### "Resume extraction failed"
- Try converting PDF to DOCX first
- Or paste resume text directly (use legacy ATS check for pasted text)

### Models not found
```bash
# Make sure models are pulled
ollama list

# If missing:
ollama pull nomic-embed-text
ollama pull qwen2.5:7b
```

---

## 📝 File Changes Overview

**New Files (Backend):**
- Resume.js, ResumeChunk.js (models)
- ollamaService.js, resumeRagService.js (services)
- resumeRagController.js (API)
- resumeRag.js (routes)

**New Files (Frontend):**
- RagAnalysisPanel.jsx (component)

**Updated Files:**
- Application.js (added ragAnalysis field)
- server.js (mounted routes)
- ResumeAtsCheckerPage.jsx (added RAG toggle)
- styles.css (added RAG styling)
- package.json (added axios)

---

## 🎯 Next Steps

### For Development
- [ ] Test with sample resumes
- [ ] Try different jobs
- [ ] Check dark/light theme
- [ ] Monitor console for errors

### For Production
- [ ] Set up MongoDB Atlas vector index
- [ ] Configure Ollama on production server
- [ ] Add rate limiting
- [ ] Setup monitoring/logging
- [ ] Test with real user data

---

## 🔐 Security Notes

✅ All endpoints require authentication (JWT)
✅ Users can only access their own resumes
✅ File validation prevents malicious uploads
✅ Resume data is encrypted during transit

---

## 📈 Performance Tips

1. **Faster analysis:** Use `mistral:7b` instead of `qwen2.5:7b`
   - Set: `OLLAMA_ANALYSIS_MODEL=mistral:7b`
   - Trade-off: Less accurate but 30% faster

2. **GPU acceleration:** Run Ollama on GPU
   - Requires CUDA or Metal support
   - Makes analysis ~5x faster

3. **Caching:** Same resume + job combo is fast on retry

---

## 📚 Documentation

- **Full Details:** Read `RAG_IMPLEMENTATION_SUMMARY.md`
- **API Docs:** See `backend/src/routes/resumeRag.js`
- **Component Docs:** Check `frontend/src/components/resume/RagAnalysisPanel.jsx`

---

## ❓ FAQ

**Q: Do I need MongoDB Atlas?**
A: For production, yes (vector search feature). For dev, local MongoDB works.

**Q: Can I use different Ollama models?**
A: Yes! Change OLLAMA_ANALYSIS_MODEL in .env. Try: mistral:7b, neural-chat:7b, orca-mini:7b

**Q: Is my resume data safe?**
A: Yes. Stored encrypted in MongoDB. Only you can access your resumes.

**Q: How long does analysis take?**
A: Typically 20-40 seconds (depends on resume size and Ollama hardware).

**Q: Can I analyze multiple resumes?**
A: Yes! Upload as many as you want. Each gets unique resumeId.

**Q: What file formats work?**
A: PDF, DOCX, DOC, TXT, PPTX

---

**Ready? Start with Step 1 above! 🚀**

For issues, check Troubleshooting section or RAG_IMPLEMENTATION_SUMMARY.md
