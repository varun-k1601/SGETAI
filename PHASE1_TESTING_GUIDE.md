# Phase 1 Testing Guide - Quick Reference

## Pre-Test Checklist
- [ ] Ollama is running locally: `ollama serve` (terminal)
- [ ] Your GetAI backend is running
- [ ] Frontend is accessible (likely http://localhost:5173 or similar)
- [ ] You have a user profile set up in GetAI with some skills and preferred roles

---

## 5 Test Questions (Try These in Order)

### Test 1: General Knowledge (What is a Software Engineer?)
**Ask the Career Agent:**
```
What is the role of a software engineer?
```

**What to expect (BEFORE Phase 1):**
- "Software engineers design, develop, and maintain software systems..."
- Length: ~20-50 words
- Generic, no structure

**What to expect (AFTER Phase 1):**
- 200-350 word answer with structure
- Multiple sections: responsibilities, skills, career path, your context
- References to your actual skills (e.g., "Your Node.js skills align well...")
- Specific guidance next steps

**Success?** ✅ If you get 150+ words with structure and context reference

---

### Test 2: Skill Development
**Ask the Career Agent:**
```
What skills do I need to learn backend development with Node.js?
```

**What to expect (AFTER Phase 1):**
- Roadmap with 4-5 key areas (Language, Database, API Design, Architecture, DevOps)
- Each area has 2-3 specific technologies
- Time estimates (e.g., "2-3 months on fundamentals")
- Sequenced learning path
- Project suggestions
- How it relates to your current profile

**Example structure:**
```
To become a backend developer with Node.js, build expertise in these areas:

1. **Language & Fundamentals** - Master Node.js, async/await, error handling. ~6-8 weeks

2. **Database Design** - Learn SQL and MongoDB, schema design, optimization. ~4-6 weeks

3. **API Design** - RESTful APIs, routing, validation, authentication (JWT). ~4-6 weeks

4. **Architecture** - Controllers, services, middleware, clean code patterns. ~3-4 weeks

5. **DevOps** - Docker, CI/CD, environment management. ~2-3 weeks

Since you already have JavaScript and some backend experience, focus on database optimization 
and system design which appear in 78% of job postings you match with.

Recommended project: Build a complete REST API with user authentication and database.
```

**Success?** ✅ If answer includes roadmap, time estimates, and your context

---

### Test 3: Job Search
**Ask the Career Agent:**
```
Show me backend developer jobs available for me
```

**What to expect (AFTER Phase 1):**
- List of actual job titles and companies (not hypothetical)
- For each job:
  - Title and company
  - Location
  - Key required skills
  - Match percentage / fit explanation
- Specific next steps for each job
- Summary of skill gaps across jobs

**Example:**
```
I found 5 backend positions matching your profile. Here are the top 3:

1. **Senior Backend Engineer** at TechCorp — San Francisco, Full-time
   Required skills: Node.js, PostgreSQL, Docker, AWS
   Your match: 85% (you have Node.js, missing Docker and AWS)
   Next step: Your PostgreSQL skills transfer well. Learn Docker basics 
   (2-3 weeks) then apply - this is a strong match.

2. **Backend Developer (Remote)** at StartupXYZ — Remote, Full-time
   Required skills: Node.js, MongoDB, REST APIs
   Your match: 92% (near perfect fit)
   Next step: Apply immediately and highlight your MongoDB experience 
   from your Job Search Platform project.

[Continue for more jobs...]

Across all positions, the most in-demand missing skill is Docker (appears in 85% of postings).
Consider adding a Docker project to your portfolio.
```

**Success?** ✅ If answer includes actual job titles/companies with specific fit analysis

---

### Test 4: Resume/ATS
**Ask the Career Agent:**
```
How can I improve my resume for backend roles?
```

**What to expect (AFTER Phase 1):**
- 3-5 step optimization guide
- Specific keywords from current jobs market
- Before/after examples
- ATS (Applicant Tracking System) specific advice
- Priority ranking of improvements

**Example:**
```
Here's a 3-step approach to optimize your resume for backend roles:

**Step 1: Extract Keywords from Job Postings** (Do this for each role you apply to)
- Review the job description you're applying for
- Highlight 10-15 required technologies
- Ensure your resume uses these EXACT terms
- Example: Instead of "API work", use "Designed and implemented RESTful APIs"

**Step 2: Quantify and Strengthen Bullets**
- WEAK: "Worked on Node.js projects"
- STRONG: "Built 3 REST APIs handling 50K+ daily requests using Node.js and PostgreSQL, 
  reducing query time by 40%"

**Step 3: Organize for ATS Scanning**
- Use standard sections: Contact, Summary, Experience, Education, Skills
- Avoid: graphics, columns, text boxes (ATS can't parse these)
- Put your strongest skills in the Skills section at the top

Based on your profile (JavaScript, Node.js, MongoDB, React), your resume likely scores:
- Node.js: 85% match (already strong)
- MongoDB: 78% match (good)
- System Design: 35% match (BIG gap - appears in 70% of job postings)

Action: Add your "Job Search Platform" project description to show system design thinking.
```

**Success?** ✅ If answer is 200+ words with steps and specific examples

---

### Test 5: Profile Improvement
**Ask the Career Agent:**
```
What should I complete in my profile first to improve job matches?
```

**What to expect (AFTER Phase 1):**
- Prioritized checklist (Priority 1, 2, 3)
- Impact explanation for each section
- Time estimate to complete
- How it affects recommendations and ATS

**Example:**
```
Your profile is currently 68% complete. Here's what to prioritize:

**PRIORITY 1 (Do This First) - 30 minutes**
1. Add 3-4 key projects with descriptions and GitHub links
   Impact: Projects are the #1 signal recruiters look for. This alone increases 
   match quality by 40%.

2. List your top technical skills with proficiency levels (e.g., Node.js - Expert)
   Impact: Drives accurate job recommendations and ATS matching.

**PRIORITY 2 (Next) - 45 minutes**
1. Write a 2-3 sentence career objective
   Impact: Helps recruiters understand what roles you're targeting

2. Add any work experience (internships, freelance, contracting counts)
   Impact: Shows practical application of skills

**PRIORITY 3 (Nice to Have) - 20 minutes**
1. Add education details
2. Link GitHub and portfolio

Expected outcome after Priority 1+2: Profile jumps to 92%, unlocking better 
recommendations and auto-apply matching. Estimated time: 45 minutes.

You're missing projects and links - this is why you're seeing fewer job matches. 
Start with adding your "Job Search Platform" project today.
```

**Success?** ✅ If answer includes prioritized checklist with impact and time estimates

---

## Scoring Results

### ✅ SUCCESS - Phase 1 Working
- All 5 questions return 200-350+ word answers
- Answers are structured with headers/bullets/numbers
- Answers reference your actual profile, skills, and available jobs
- Answers include specific technologies, time estimates, and next steps
- Answers feel helpful and actionable, not generic

**Next step:** Proceed to Phase 2 for even more improvement

### ⚠️ PARTIAL - Some Improvement But Not Complete
- Answers are longer than before (100-200 words) but still could be more detailed
- Some structure but could be more organized
- Some context used but not fully personalized

**Possible causes:**
- Ollama model may have lower capacity (qwen2.5:7b is capable but not huge)
- Model not following format instructions perfectly
- Try asking questions more clearly or with more context

**Fix:** Proceed to Phase 2 - adding richer context will help significantly

### ❌ FAILED - Phase 1 Not Working
- Answers still short (50 words or less)
- No structure or context
- Similar to original behavior

**Possible causes:**
1. Code wasn't deployed/reloaded (restart backend)
2. Ollama service offline (check `ollama serve`)
3. Model not following JSON format

**Fix:**
1. Verify code changes in careerAgentService.js exist (check lines 813-900)
2. Check backend logs for errors
3. Restart Ollama and backend
4. Test again

---

## How to Compare: Before/After

**Before Phase 1:**
```
Q: "What is the role of a software engineer?"
A: "Software engineers design, develop, and maintain software systems using various 
   programming languages and tools."
   → 20 words, no structure, no context
```

**After Phase 1:**
```
Q: "What is the role of a software engineer?"
A: "A software engineer designs, develops, and maintains software systems. Here's what 
   this role encompasses:
   
   1. **Core Responsibilities** [...]
   2. **Technical Skills Required** [...]
   3. **Career Path & Growth** [...]
   4. **In Your Context** [...]
   
   Based on available jobs, Backend Engineer roles here are actively hiring..."
   → 250+ words, structured, personalized
```

---

## Next Steps

✅ **Phase 1 Complete?** Congrats! You now have detailed, structured answers.

**Should you implement Phase 2?**
- If answers are great → Phase 2 will make them even better with richer context
- If answers are OK but could be more specific → Phase 2 will definitely help
- If testing failed → Troubleshoot Phase 1 first before moving to Phase 2

**Phase 2 adds:**
- Full profile context (education, career history, profile completeness)
- Full job descriptions (not just title/company)
- User attachments (resume/documents)
- Enhanced conversation memory

**Estimated Phase 2 benefit:** Answers become 350-500 words and much more personalized.

---

## Questions While Testing?

Check these before troubleshooting:
1. Is Ollama running? (`ollama serve` in terminal)
2. Is the backend restarted? (Kill and restart to load new code)
3. Are you logged into GetAI with a complete profile?
4. Check browser console and backend logs for errors

Good luck! 🚀
