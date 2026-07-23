# 📦 OLLAMA SETUP GUIDE

## ❌ Current Status
- Ollama is **NOT installed** or not accessible
- Models needed: `nomic-embed-text` and `qwen2.5:7b`

---

## ✅ STEP 1: INSTALL OLLAMA

### Windows
1. Download: https://ollama.ai
2. Click the Windows download button
3. Run the installer
4. Follow installation prompts
5. Restart your computer when done
6. Verify: Open Terminal and run `ollama --version`

### Mac
1. Download: https://ollama.ai
2. Click the Mac download button
3. Drag Ollama to Applications folder
4. Launch Ollama from Applications
5. Verify: Open Terminal and run `ollama --version`

### Linux
```bash
curl https://ollama.ai/install.sh | sh
```

---

## ✅ STEP 2: PULL REQUIRED MODELS

Once Ollama is installed, open a terminal and run:

### Model 1: Embedding Model (768-dimensional)
```bash
ollama pull nomic-embed-text
```

**Size:** ~275 MB  
**Time:** 1-2 minutes  
**Expected Output:**
```
pulling manifest
pulling eec9b96e4ffc...
[========================>] 100%
success
```

### Model 2: LLM for Analysis (7 Billion Parameters)
```bash
ollama pull qwen2.5:7b
```

**Size:** ~5 GB  
**Time:** 5-10 minutes  
**Expected Output:**
```
pulling manifest
pulling 1be36a10e4ed...
[========================>] 100%
success
```

---

## 🔄 ALTERNATIVE MODELS (Faster/Smaller)

If qwen2.5:7b is too large or slow, you can use alternatives:

### Option 1: Mistral 7B (Faster)
```bash
ollama pull mistral:7b
```
- **Size:** 4.2 GB
- **Speed:** 30% faster than qwen2.5
- **Accuracy:** Slightly lower
- **Best for:** Speed-first use cases

### Option 2: Orca Mini 7B (Smaller)
```bash
ollama pull orca-mini:7b
```
- **Size:** 3.7 GB
- **Speed:** Faster
- **Accuracy:** Lower
- **Best for:** Resource-constrained systems

### Option 3: Neural Chat 7B (Specialized)
```bash
ollama pull neural-chat:7b
```
- **Size:** 4.1 GB
- **Speed:** Medium
- **Accuracy:** Good for conversations
- **Best for:** Better dialogue

---

## 📋 FULL SETUP CHECKLIST

- [ ] Ollama installed
- [ ] Ollama accessible from terminal (`ollama --version` works)
- [ ] Model 1 pulled: `ollama pull nomic-embed-text`
- [ ] Model 2 pulled: `ollama pull qwen2.5:7b` (or alternative)
- [ ] Verify: `ollama list` shows both models

---

## 🔍 VERIFY INSTALLATION

### Check Ollama is installed:
```bash
ollama --version
```
✅ Should show version number

### Check models are downloaded:
```bash
ollama list
```
✅ Should show:
```
NAME                    ID              SIZE    MODIFIED
nomic-embed-text:latest abc123...       275 MB  2 minutes ago
qwen2.5:7b:latest       def456...       5.0 GB  1 minute ago
```

### Test Ollama server:
```bash
ollama serve
```
✅ Should show:
```
time=2026-06-20T... level=INFO msg="Listening on" address=[::]:11434
time=2026-06-20T... level=INFO msg="Listening on" address=127.0.0.1:11434
```

---

## 💾 SYSTEM REQUIREMENTS

### Minimum
- **RAM:** 8 GB (4 GB dedicated to Ollama)
- **Disk:** 10 GB free (for both models)
- **OS:** Windows 10+, Mac OS 10.13+, Linux

### Recommended
- **RAM:** 16 GB+
- **GPU:** NVIDIA (CUDA), Apple Silicon, AMD (ROCm)
- **Disk:** 20 GB+ SSD

### For GPU Acceleration
- **NVIDIA:** CUDA Toolkit + compatible GPU
- **Apple Silicon:** Automatic (M1/M2/M3 Macs)
- **AMD:** ROCm support (Linux)

---

## ⚡ PERFORMANCE TIPS

### Speed Up Model Downloads
Use a faster internet connection:
```bash
# Check download speed
ollama pull qwen2.5:7b
```

### Enable GPU Acceleration (Windows + NVIDIA)
1. Install CUDA Toolkit: https://developer.nvidia.com/cuda-toolkit
2. Install cuDNN: https://developer.nvidia.com/cudnn
3. Restart Ollama
4. Run: `ollama run qwen2.5:7b`

### Check GPU is being used
```bash
nvidia-smi
```
✅ Should show GPU memory usage during inference

---

## 🚀 AFTER SETUP: START SERVICES

Once Ollama is installed and models are downloaded:

### Terminal 1: Start Ollama
```bash
ollama serve
```

### Terminal 2: Start Backend
```bash
cd backend && npm run dev
```

### Terminal 3: Start Frontend
```bash
cd frontend && npm run dev
```

### Then Test
Open: **http://localhost:5173/ats-checker**

---

## 🔧 TROUBLESHOOTING

### Problem: "ollama: command not found"
**Solution:**
- Windows: Restart your computer after installation
- Mac/Linux: Add Ollama to PATH:
  ```bash
  export PATH=$PATH:/usr/bin/ollama
  ```

### Problem: Download stuck/slow
**Solution:**
- Check internet: `ping 8.8.8.8`
- Restart download: `ollama pull qwen2.5:7b` (automatically resumes)
- Use alternative: `ollama pull mistral:7b` (smaller)

### Problem: "Out of disk space"
**Solution:**
- Clean up: `ollama rm qwen2.5:7b` (delete model)
- Free up space and retry
- Use smaller model: `ollama pull orca-mini:7b`

### Problem: GPU not being used
**Solution:**
- Windows + NVIDIA: Install CUDA Toolkit
- Mac: Already automatic on Apple Silicon
- Linux: Install ROCm for AMD GPUs

### Problem: Very slow inference (>1 minute)
**Solution:**
- Switch to faster model: `mistral:7b` or `orca-mini:7b`
- Enable GPU acceleration
- Close other applications
- Check CPU usage: `top` (Mac/Linux) or Task Manager (Windows)

---

## 📊 MODEL COMPARISON

| Model | Size | Speed | Accuracy | RAM | Disk |
|-------|------|-------|----------|-----|------|
| nomic-embed-text | 275MB | Instant | N/A | 1GB | 275MB |
| qwen2.5:7b | 5.0GB | 10-20s | Excellent | 8GB | 5GB |
| mistral:7b | 4.2GB | 7-15s | Good | 7GB | 4.2GB |
| orca-mini:7b | 3.7GB | 5-10s | Moderate | 6GB | 3.7GB |
| neural-chat:7b | 4.1GB | 8-15s | Good | 7GB | 4.1GB |

---

## ✅ ONCE SETUP IS COMPLETE

1. Verify `ollama list` shows both models
2. Run `ollama serve` (Terminal 1)
3. Run backend in Terminal 2
4. Run frontend in Terminal 3
5. Open http://localhost:5173/ats-checker
6. Upload resume and test RAG analysis

---

## 📞 NEED HELP?

### Quick Checks
```bash
# Is Ollama installed?
ollama --version

# Are models downloaded?
ollama list

# Is server running?
curl http://localhost:11434/api/tags

# Can you use the model?
ollama run qwen2.5:7b "Hello, who are you?"
```

### Documentation
- Ollama Docs: https://ollama.ai/docs
- Model Library: https://ollama.ai/library
- GitHub Issues: https://github.com/ollama/ollama/issues

---

## 🎉 READY!

Once Ollama is set up and models are downloaded:

1. Start Ollama: `ollama serve`
2. Start Backend: `cd backend && npm run dev`
3. Start Frontend: `cd frontend && npm run dev`
4. Test: http://localhost:5173/ats-checker

Good luck! 🚀
