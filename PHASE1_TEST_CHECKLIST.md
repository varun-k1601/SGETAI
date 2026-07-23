# Phase 1 Testing Checklist

## Pre-Test Setup
- [x] ✅ Ollama is running (verified)
- [x] ✅ Ollama has qwen2.5:7b model loaded
- [ ] Make sure your backend is running
- [ ] Make sure your frontend is accessible (http://localhost:5173 or your port)
- [ ] You're logged into GetAI with a user account

## Before You Start Testing
1. **Verify Phase 1 code is loaded:**
   - Backend needs to be RESTARTED after code changes
   - If backend was running before, stop it and start it again
   - This ensures `careerAgentService.js` changes are loaded

2. **Optional: Check backend logs**
   - When you ask the Career Agent a question, you should see in logs:
   - `[CareerAgent] Calling Ollama model: qwen2.5:7b`
   - `[Ollama] Starting chat request...`
   - Response time should be 15-30 seconds

---

## Test Questions (Ask in This Order)

### Question 1: General Knowledge
```
What is the role of a software engineer?
```

**Expected:** 200-300 word answer with:
- Multiple sections (responsibilities, skills, career path, your context)
- Structured with headers or bullets
- References to actual job market / available roles
- Actionable next steps

**Success Criteria:**
- [ ] Answer is 200+ words (not 20-50)
- [ ] Answer has structure (headers, bullets, numbered list)
- [ ] Answer mentions specific technologies
- [ ] Answer references career progression

---

### Question 2: Skill Development
```
What skills do I need to learn backend development with Node.js?
```

**Expected:** 250-350 word answer with:
- Roadmap with 5 key areas (Language, Database, API Design, Architecture, DevOps)
- Time estimates for each area (e.g., "6-8 weeks")
- Specific technologies listed
- Sequenced learning path
- How it relates to your profile/career

**Success Criteria:**
- [ ] Answer includes a roadmap structure (5+ key areas)
- [ ] Time estimates provided
- [ ] Specific technologies mentioned (Node.js, MongoDB, PostgreSQL, Docker, etc.)
- [ ] Personalized to your profile/skills

---

### Question 3: Job Search
```
Show me backend developer jobs available for me
```

**Expected:** 250-350 word answer with:
- Actual job titles and company names (if jobs exist in your database)
- For each job: title, company, location, key skills
- Match percentage / fit explanation for each job
- Specific next steps for each job
- Summary of skill gaps or in-demand skills

**Success Criteria:**
- [ ] Lists actual job titles/companies (not hypothetical)
- [ ] Provides match analysis for each job
- [ ] Specific next steps recommended
- [ ] Mentions skill gaps or in-demand skills
- [ ] Answer is 250+ words

---

### Question 4: Resume/ATS Improvement
```
How can I improve my resume for backend engineering roles?
```

**Expected:** 200-300 word answer with:
- Step-by-step guide (3-5 steps)
- Specific keyword examples
- Before/after examples
- ATS-specific advice
- Prioritized improvements

**Success Criteria:**
- [ ] Provides 3+ actionable steps
- [ ] Includes before/after examples
- [ ] Mentions specific keywords/technologies
- [ ] References your actual skills
- [ ] 200+ words with structure

---

### Question 5: Profile Improvement
```
What should I complete in my profile first to improve job matches?
```

**Expected:** 200-300 word answer with:
- Prioritized checklist (Priority 1, 2, 3)
- Impact explanation for each section
- Time estimate to complete
- How it affects recommendations/ATS
- Specific next action items

**Success Criteria:**
- [ ] Provides prioritized list (Priority 1, 2, 3)
- [ ] Explains impact of each section
- [ ] Time estimates provided
- [ ] References your actual profile gaps
- [ ] 200+ words with clear structure

---

## Results Recording Template

For each question, fill out:

### Q1: Software Engineer Role
**Word Count:** _____ words
**Structure?** ✅ Yes / ⚠️ Partial / ❌ No
**Personalized?** ✅ Yes / ⚠️ Partial / ❌ No
**Rating:** ✅ Good / ⚠️ OK / ❌ Failed

**Notes:**
[Copy first 2 sentences of answer here]
...

---

### Q2: Backend Skills Roadmap
**Word Count:** _____ words
**Has Roadmap?** ✅ Yes / ❌ No
**Time Estimates?** ✅ Yes / ❌ No
**Personalized?** ✅ Yes / ⚠️ Partial / ❌ No
**Rating:** ✅ Good / ⚠️ OK / ❌ Failed

**Notes:**
[Paste key sections here]

---

### Q3: Job Search
**Word Count:** _____ words
**Lists Job Titles?** ✅ Yes / ❌ No
**Lists Companies?** ✅ Yes / ❌ No
**Match Analysis?** ✅ Yes / ⚠️ Partial / ❌ No
**Rating:** ✅ Good / ⚠️ OK / ❌ Failed

**Notes:**
[Paste job matches here]

---

### Q4: Resume/ATS
**Word Count:** _____ words
**Has Steps?** ✅ Yes / ❌ No
**Has Examples?** ✅ Yes / ❌ No
**Personalized?** ✅ Yes / ⚠️ Partial / ❌ No
**Rating:** ✅ Good / ⚠️ OK / ❌ Failed

**Notes:**
[Paste key steps here]

---

### Q5: Profile Improvement
**Word Count:** _____ words
**Prioritized?** ✅ Yes / ❌ No
**Has Impact Info?** ✅ Yes / ❌ No
**Has Time Estimates?** ✅ Yes / ⚠️ Partial / ❌ No
**Rating:** ✅ Good / ⚠️ OK / ❌ Failed

**Notes:**
[Paste priorities here]

---

## Overall Test Results

**Total Questions:** 5

**Success:** _____ / 5 (answers 200+ words with structure)

**Overall Rating:**
- ✅ **EXCELLENT** - All 5 questions returned detailed, structured, personalized answers
  → Phase 1 is working perfectly. Ready for Phase 2!
  
- ⚠️ **GOOD** - 3-4 questions were excellent, 1-2 were OK
  → Phase 1 is mostly working. Model may need refinement or Phase 2 context will help significantly.
  
- ⚠️ **PARTIAL** - 2 questions were decent, 3 were short/generic
  → Phase 1 is helping but not fully working. Check:
     - Is backend restarted after code changes?
     - Are logs showing the new prompt being sent?
     - Try Phase 2 which adds more context
     
- ❌ **FAILED** - Most answers still short/generic (50-100 words)
  → Phase 1 not working. Troubleshoot:
     - Verify `careerAgentService.js` changes are present
     - Backend needs to be restarted
     - Check Ollama is running and responding
     - Check backend logs for errors

---

## Troubleshooting

### Issue: Answers still short (50-100 words)
**Solution:**
1. Restart your backend service (kill and restart the process)
2. Check that `/backend/src/services/careerAgentService.js` has the changes:
   - Look for `exampleResponsesByIntent` around line 813
   - Look for `CRITICAL INSTRUCTIONS` in prompt around line 900
3. Check backend logs for errors when calling Ollama

### Issue: Some answers good, some short
**Possible causes:**
- Ollama model sometimes inconsistent (it's an LLM, not deterministic)
- Try asking same question twice to see if answer is more detailed
- This is normal - move to Phase 2 for more consistency

### Issue: Ollama timeout
**Solution:**
- Ollama can be slow on first request
- Let it warm up (run a test question first)
- Check Ollama is not running out of memory

### Issue: Backend can't find Ollama
**Solution:**
- Verify `OLLAMA_BASE_URL` is set to `http://localhost:11434`
- Check `.env` file has correct settings
- Restart both Ollama and backend

---

## What to Do Next

### If Phase 1 Test ✅ PASSED
Congratulations! Phase 1 is working.

**Option 1:** You're satisfied with the improvement → Stop here! You've achieved 4-5x better answers.

**Option 2:** You want even more detailed answers → Implement Phase 2 (2-3 days)
- Phase 2 adds rich context (full profiles, job descriptions, attachments)
- Answers will jump to 350-500 words
- Much more personalized

### If Phase 1 Test ⚠️ PARTIAL
Phase 1 is partially working.

**Next steps:**
1. Check the troubleshooting section above
2. Verify backend restart
3. Try Phase 2 - the additional context might help significantly

### If Phase 1 Test ❌ FAILED
Phase 1 not working properly.

**Immediate actions:**
1. Run troubleshooting steps above
2. Check backend logs: `[CareerAgent]` messages should appear
3. Verify code changes in `careerAgentService.js`
4. If still failing, there may be an environment issue

---

## Quick Command Reference

```bash
# Check Ollama is running
ollama serve

# Restart Ollama (in new terminal)
# Kill the ollama serve terminal, then run it again

# Restart backend
# Kill the backend process, then:
npm run dev  # or however you start the backend

# Check backend logs (if running with npm)
# Logs should show [CareerAgent] messages
```

---

## Testing Timeline
- **Q1-Q3:** Should complete within 5 minutes
- **Q4-Q5:** May take 30-60 seconds each (Ollama response time)
- **Total:** Plan for 10-15 minutes of testing

Good luck! 🚀 Let me know your results when you're done!
