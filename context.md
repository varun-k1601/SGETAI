# SGETAI Agent Context

This file is the first-stop context for Claude, Codex, or any coding agent working in this repository. Read it before making changes, then inspect the exact files involved in the task.

## Project Snapshot

SGETAI is a full-stack job search and career platform with:

- Seeker, recruiter/organization, and admin roles.
- Username/password auth, Google/Microsoft OAuth, and admin password login.
- Profiles, portfolio sections, social feed, follows, connections, chat, notifications.
- Jobs, applications, recruiter candidate management, ATS scoring, verification checks.
- Pro seeker features: AI career assistant, auto-apply, pre-apply match checks, AI resume generation, PDF resume compilation.
- AI integrations through Google Gemini and vector search-style recommendations.
- File/media storage through Supabase.
- Optional Razorpay payments with a mock checkout fallback.

The repo is not currently a Git worktree from this checkout, even though `.gitignore` exists.

## Repository Layout

```text
backend/             Node.js + Express + MongoDB API
frontend/            React + Vite SPA
tools/               Local tooling, including TinyTeX for PDF resume compilation
sample-resume.pdf    Sample resume asset
context.md           This agent handoff file
```

Ignore these for most source scans unless the task explicitly touches them:

- `backend/node_modules/`
- `frontend/node_modules/`
- `frontend/dist/`
- `tools/TinyTeX/`
- `tools/TinyTeX-1-windows-v2026.04.exe`

Use `rg` with globs such as:

```bash
rg "pattern" backend/src frontend/src -g "!node_modules" -g "!dist"
```

## Backend

Backend path: `backend/`

Runtime and stack:

- Node >= 18
- Express 5
- Mongoose / MongoDB
- Socket.io
- Supabase Storage
- Nodemailer
- Google Gemini via `@google/genai`
- `node-cron`
- Optional Razorpay via direct API calls

Commands:

```bash
cd backend
npm install
npm run dev
npm start
npm run smoke:test
npm run seed:jobs
npm run organizations:verify-matched
npm run agent:evaluate
```

Main files:

- `backend/src/server.js`: app creation, middleware, route mounting, boot sequence.
- `backend/src/config/env.js`: required env validation.
- `backend/src/config/db.js`: Mongo connection.
- `backend/src/middleware/*`: auth, roles, upload, errors.
- `backend/src/controllers/*`: request handlers.
- `backend/src/services/*`: AI, payment, notification, matching, resume, platform policy logic.
- `backend/src/models/*`: Mongoose schemas.
- `backend/src/workers/*`: scheduled/background work.

Boot sequence in `src/server.js`:

1. `validateEnv()`
2. Connect MongoDB.
3. Ensure SuperAdmin from `ADMIN_EMAIL` / `ADMIN_PASS`.
4. Verify email connection.
5. Verify Supabase connection.
6. Create HTTP server and initialize Socket.io.
7. Start verification and midnight cron workers.
8. Listen on `PORT`, defaulting to 5000.

Global middleware:

- `helmet()`
- `cors()` with permissive dev behavior and `FRONTEND_URL` check in production.
- `express.json({ limit: "2mb" })`
- Standard 404 and error handlers.

Response convention:

- Successful JSON generally includes `success: true`.
- Errors generally include `success: false`, `message`, optional `details`, and stack traces outside production.

Auth convention:

- Bearer JWT is required by `requireAuth`.
- `req.user` is the JWT payload: usually `{ id, role, email }`.
- Admin roles are `SuperAdmin` and `Moderator`.
- Seeker role is `seeker`; recruiter/org role is `organization`.

## Backend Environment

`backend/.env.example` is present. Required by `validateEnv()`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/getai
JWT_SECRET=...
JWT_REFRESH_SECRET=...
JWT_VERIFICATION_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_BUCKET=sgetai-uploads
EMAIL_USER=...
EMAIL_PASS=...
FRONTEND_URL=http://localhost:5173
GEMINI_API_KEY=...
```

Also supported or referenced:

```env
NODE_ENV=development
ADMIN_EMAIL=admin@getai.com
ADMIN_PASS=Admin@123
CAREER_AGENT_MODEL=gemini-2.5-flash
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/oauth/google/callback
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/oauth/microsoft/callback
CAREER_AGENT_MESSAGE_TTL_DAYS=60
CAREER_AGENT_MAX_MESSAGES_PER_USER=40
PAYMENT_PROVIDER=mock
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PDFLATEX_PATH=
```

Do not expose `SUPABASE_SERVICE_KEY`, JWT secrets, email password, Razorpay secret, or Gemini key to frontend code.

## Backend Routes

Mounted in `backend/src/server.js`:

- `GET /health`
- `/api/auth`
- `/api/profile`
- `/api/connections`
- `/api/follows`
- `/api/seekers`
- `/api/organizations`
- `/api/notifications`
- `/api/posts`
- `/api/chat`
- `/api/jobs`
- `/api/applications`
- `/api/search`
- `/api/analytics`
- `/api/verification`
- `/api/recommendations`
- `/api/pro`
- `/api/subscriptions`
- `/api/resume`
- `/api/admin`

Important route surface:

- Auth: `/register/:role`, `/register/organization`, `/login`, `/admin/login`, `/me`, OAuth start/callback/organization completion.
- Profile: `/me`, media streaming, picture/background video, career objective, projects, certifications, research, achievements.
- Jobs: create/list mine/close/delete/apply/list applications.
- Applications: `/mine`, resume download, withdraw, status update.
- Search: jobs, seekers, organizations.
- Pro: pre-apply check, resume generation, resume PDF generation, career agent chat/debug, auto-apply preferences/runs/test-run.
- Subscriptions: plans, current subscription, checkout, confirm.
- Admin: overview and platform Pro auto-apply policy.
- Verification: trigger for an application and public manager submission.

When adding endpoints, update both the route file and any relevant frontend API calls. Prefer existing controller/service style rather than putting heavy logic in route files.

## Backend Data Model Highlights

Core models:

- `JobSeeker`: identity, profile, portfolio sections, skills, embedding, hidden roles, Pro subscription fields, auto-apply preferences/counts.
- `Organization`: company profile, domain/verification status, representative details, trust score policy.
- `Job`: posting fields, text index, 768-dimensional embedding, hidden roles.
- `Application`: job/seeker/org relation, ATS/trust scores, statuses including `Withdrawn`, manual/auto source, tailored and attached resumes. Unique `{ jobId, jobSeekerId }`.
- `Admin`: admin auth.
- `Notification`, `ChatSession`, `ChatMessage`, `Connection`, `Follow`, `Post`, `Like`, `Comment`.
- `VerificationRequest`, `SubscriptionPayment`, `PlatformSetting`, `AutoApplyRun`.
- `CareerAgentMessage`, `CareerAgentMemory`.

Embedding fields are `select: false` and validated to length 768. Use explicit `+embedding` or service helpers when needed.

## AI And Matching

AI services live in `backend/src/services/`.

- `geminiService.js`: embeddings, candidate/job match evaluation, resume-file ATS evaluation, hidden role extraction.
- `geminiGenerativeService.js`: generative Pro flows.
- `careerAgentService.js` and `careerAgentMemoryService.js`: RAG-ish career assistant behavior.
- `matchService.js`: deterministic/fallback candidate matching.
- `aiSyncService.js`: sync seeker/job AI-derived fields.
- `resumeGenerationService.js`, `resumeScoringService.js`, `atsCheckerService.js`, `applicationResumeService.js`: resume and ATS features.

Important behavior:

- Gemini failures are usually designed to degrade gracefully to deterministic fallbacks, empty arrays, or `null`.
- If `GEMINI_API_KEY` is missing or placeholder-like, many AI features fall back rather than crashing.
- MongoDB Atlas vector indexes may be needed for best recommendations. Without them, code should fall back gracefully.

## Resume PDF / TinyTeX

`backend/src/services/latexCompilerService.js` compiles generated LaTeX into PDF using the first available candidate:

1. `PDFLATEX_PATH`
2. `tools/TinyTeX/TinyTeX/bin/windows/pdflatex.exe`
3. `tools/TinyTeX/bin/windows/pdflatex.exe`
4. `pdflatex` on PATH

Compilation writes temp files under the OS temp directory and cleans them up. On Windows, the bundled TinyTeX is likely intentional; avoid deleting or restructuring `tools/` unless asked.

## Storage And Uploads

Uploads use Multer memory storage and Supabase helpers. Media records generally store:

```js
{ url, filePath, fileType }
```

The intended pattern is:

- Upload to Supabase.
- Save DB record.
- Roll back uploaded files if DB save fails.
- Delete old Supabase files when replacing/removing media.

Use existing helpers in `backend/src/utils/mediaStorage.js`, `supabaseService.js`, and upload middleware.

## Background Workers

Workers:

- `verificationCron.js`: verification grace/reminder workflow.
- `midnightCron.js`: resets daily quotas.
- `autoApplyWorker.js`: background auto-apply flow after jobs are created or via Pro test-run.

Auto-apply depends on:

- Seeker `isPro`.
- Seeker `autoApplyPreferences.enabled`.
- Hidden roles.
- Platform policy from `PlatformSetting`.
- ATS/match score threshold.
- Duplicate application handling.

## Frontend

Frontend path: `frontend/`

Stack:

- React 18
- Vite
- React Router
- TanStack React Query
- Plain CSS in `frontend/src/styles.css`

Commands:

```bash
cd frontend
npm install
npm run dev
npm run build
npm run preview
```

Vite dev server defaults to port `5173`.

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Important files:

- `frontend/src/main.jsx`: app bootstrap.
- `frontend/src/App.jsx`: provider composition.
- `frontend/src/routes/AppRouter.jsx`: route tree.
- `frontend/src/routes/ProtectedRoute.jsx`: auth guard.
- `frontend/src/context/AuthContext.jsx`: localStorage-backed session, `/auth/me`, `/profile/me` hydration.
- `frontend/src/context/ThemeContext.jsx`: theme handling.
- `frontend/src/services/api.js`: JSON, form, and blob request helpers.
- `frontend/src/layouts/AppShell.jsx`: authenticated layout, nav, global search, footer.
- `frontend/src/pages/*`: page-level features.

Frontend routes:

- Public: `/login`, `/register`, `/oauth/callback`, `/oauth/complete-recruiter`, `/verification`.
- Protected shell: `/dashboard`, role dashboards, `/profile`, `/feed`, `/posts/create`, `/chat`, `/upgrade`, `/resume-builder`, `/ats-checker`, `/notifications`, `/following`, `/connections`, `/organizations/:id`, `/applications`, `/recruiter/applications`, `/jobs`, `/recruiter/jobs`, `/pro/tools`.

API helper behavior:

- `apiRequest(path, { token, body, ... })`: JSON request.
- `apiFormRequest(path, { token, formData, ... })`: multipart/form-data request.
- `apiBlobRequest(path, { token, body, ... })`: file/blob request and filename parsing.

All helper paths are relative to `VITE_API_BASE_URL`.

## Development Workflow For Agents

1. Read this file.
2. Inspect the exact backend route/controller/service/model or frontend page involved.
3. Check both sides of the API contract if changing behavior.
4. Keep edits scoped. Do not refactor unrelated modules.
5. Use existing response shapes, error handling, model names, and role names.
6. Avoid editing generated/build artifacts like `frontend/dist`.
7. Do not touch real `.env` secrets. Use `.env.example` only for documenting variables.
8. Prefer `npm run build` in `frontend` after frontend changes.
9. Prefer `npm run smoke:test` or targeted scripts in `backend` after backend changes, if env/services are available.
10. If a verification command fails because MongoDB/Supabase/Gemini/email is not configured locally, report that clearly instead of masking it.
11. After every meaningful backend/frontend change, update this `context.md` with the relevant new behavior, changed files, or workflow notes.

## Recent Implementation Notes

### Career Agent Issue (Current)

Career Agent falls back to generic "AI backend temporarily unavailable" for general knowledge questions because the backend server was not restarted after the Gemini API key was updated in `.env`. Solution: Restart backend with `npm run dev` so it reloads the pro plan API key (`AIzaSyAPU5TCYOv079CDeNWgblf3Zg1PIkpleWU`) into memory. The service caches the Gemini client on startup; old instances will not pick up the new key.

### Auto-Apply Tailored Resume Generation (Latest)

Auto-apply now **always** generates and attaches tailored resumes based on job requirements:

- `backend/src/workers/autoApplyWorker.js::attachResumeForAutoApply()` calls `buildTailoredResumeForJob()` for every auto-apply application (removed conditional check for user preference).
- Fallback chain: tailored resume → default resume → skip application if no resume available.
- `escapeRegexSpecialChars(str)` escapes special regex characters in skill matching within `buildSkillFallbackQuery()`.
- `backend/src/models/Job.js`: Removed `default: 70` from `autoApplyThreshold` schema; validation only enforces bounds if threshold is explicitly provided.
- `backend/src/controllers/jobController.js::getAutoApplyFields()`: `autoApplyEnabled` defaults to `true` for new jobs; no hardcoded threshold fallback.
- `backend/src/controllers/jobController.js::updateJob()`: Recruiters cannot update `autoApplyThreshold` or `autoApplyDailyCap`; threshold changes trigger re-run with source `"job_threshold_changed"`.
- `backend/src/controllers/adminController.js::updateJobThreshold()`: SuperAdmin-only endpoint to update thresholds and trigger auto-apply; uses fire-and-forget pattern.
- `backend/src/routes/admin.js`: Route `PUT /admin/jobs/:jobId/threshold` restricted to SuperAdmin.
- Platform auto-apply policy threshold is global; individual job thresholds (when provided by admin) override it.

### Career Agent and Attachments

- Career agent attachments are supported on `POST /api/pro/agent/chat`.
- That route now uses `uploadArray` and accepts multipart `files` plus `message` and JSON-stringified `history`.
- `backend/src/controllers/proFeaturesController.js` extracts text from PDF/DOCX/TXT attachments where possible and sends attachment summaries to the agent.
- `backend/src/utils/resumeTextExtractor.js` now uses `pdf-parse` for PDFs, `mammoth` for DOC/DOCX, simple ZIP/XML extraction for PPTX, and TXT decoding; `extractResumeText(file)` is async and returns cleaned text or an empty string.
- `backend/src/controllers/proFeaturesController.js` awaits async attachment extraction and adds a note for Gemini when extracted attachment text is empty or low quality, allowing inlineData vision/document reading to help where supported.
- Supported small inline Gemini attachment context includes images, PDFs, TXT, and videos when the file is within the inline size guard.
- `backend/src/services/careerAgentService.js` includes attachment context in the prompt and sends supported inline files to Gemini with `inlineData`.
- `backend/src/services/careerAgentService.js` now prompts Gemini as a full-knowledge AI assistant with career specialization, so general/technical questions should be answered directly instead of deflected to career-only topics.
- `backend/src/services/careerAgentService.js` classifies common explainer questions as `general_knowledge`, uses a strict answer-first/no-deflection Gemini prompt, and logs a warning when `GEMINI_API_KEY` is missing or placeholder so fallback behavior is obvious.
- `backend/src/services/careerAgentService.js` has job-search-specific fallback and prompt rules that distinguish company, location, and job-title queries; compact job summaries are trimmed to 400 chars to keep Career Agent prompts focused.
- `frontend/src/components/CareerAgentWidget.jsx` owns the Pro Career Agent chat UI globally; it uses `apiFormRequest` with multipart `files`, `message`, and JSON-stringified `history`.
- `frontend/src/layouts/AppShell.jsx` mounts the Career Agent floating widget only when `session.isPro` is true; `frontend/src/pages/pro/ProToolsPage.jsx` no longer embeds the chat panel.
- Career Agent widget styles in `frontend/src/styles.css` define the missing `--primary` theme alias and explicitly center the FAB, close button, attachment button, and send button so the floating panel controls remain visible.
- The Career Agent floating panel is horizontally resizable from a slim left-edge rail on desktop, and its composer uses an in-input `+` attachment control instead of a separate Attach button.
- The Career Agent resize rail stays visually subtle by default and only highlights on hover, focus, or active dragging.
- The Career Agent composer is a slim pill-shaped input bar with a left-side `+` attachment control, left-aligned placeholder text, and an auto-growing textarea as messages get longer.
- The Career Agent composer includes browser Web Speech API voice input when supported, uses a circular upward-arrow send button, and switches into a waveform recording bar with cancel and confirm controls while dictating.
- The Career Agent voice confirm button commits the latest interim transcript before stopping recognition, covering browsers that do not emit a final speech result on manual stop.
- The Career Agent voice confirm button now only appends dictated text into the composer input for review/editing; it does not send automatically. The send path remains manual through the composer submit action, and cancel aborts speech recognition without changing the input.
- Career Agent voice recognition uses continuous Web Speech mode so dictation stays active across pauses until the user confirms or cancels.
- `frontend/src/styles.css` dark mode uses simple, minimal colors throughout:
  * Backgrounds: pure black (#0a0a0a), dark gray (#1a1a1a), simple grays (#252525, #2d2d2d)
  * Text: pure white (#ffffff), light gray (#b0b0b0)
  * Accents: blue brand color (#2f80ff), light blue (#5ba3ff), dark blue (#1a2d5a)
  * No graphite, teal, or green accents. All decorative gradients use simple color blends.
  * All card selections, pills, and state indicators use blue family instead of teal/green.
- `backend/src/services/resumeGenerationService.js` now sorts education entries reverse-chronologically while building resumes and also post-processes generated LaTeX with `postProcessLatexResume()` before compilation.
- `backend/src/services/geminiGenerativeService.js` adds explicit resume prompt rules for reverse-chronological education order, left-aligned section headers, right-aligned dates, and consistent spacing.
- Manual Pro resume generation and auto-apply tailored resumes share `applicationResumeService -> generateLatexResume`, so the education-ordering and LaTeX alignment safety net applies to both paths.
- Recruiter resume preview/download is handled through authenticated `GET /api/applications/:id/resume`.
- That endpoint accepts `?disposition=inline` for preview and streams manual Supabase resumes or compiled tailored PDF resumes.
- Seeker-side application details in `frontend/src/pages/applications/ApplicationsPage.jsx` also use `apiBlobRequest` against `GET /api/applications/:id/resume` for resume preview/download, including manual attached resumes and tailored PDF resumes from Pro/auto-apply flows.
- Auto-apply scoring now preserves the same baseline profile match score used by pre-apply checks and keeps the weighted composite as debugging breakdown, so the visible pre-apply score and background threshold gate do not disagree.

## Common Hiccup Zones

- The backend README is useful but may be stale or mojibake-encoded in places. Trust source files over README.
- `FRONTEND_URL` in backend `.env.example` is `http://localhost:5173`, while old README snippets may mention `3000`.
- The repo includes installed dependencies and build output; do not infer source ownership from `node_modules` or `dist`.
- Some AI/vector features depend on external services and may silently fall back.
- Pro gating is enforced server-side through `requirePro`; do not rely on frontend checks.
- Admin routes require `SuperAdmin` or `Moderator`; only `SuperAdmin` can update the Pro auto-apply policy.
- Organization registration has domain/corporate email checks and may put organizations on hold.
- Application uniqueness means reapply/withdraw flows must respect the unique `{ jobId, jobSeekerId }` index.
- Blob endpoints may return PDF, TeX, resume docs, or streamed profile media; frontend has special handling for filenames/content types.
- Profile media for organizations uses `logo`, while seeker profile media uses `profilePicture`.
- Socket.io notification behavior depends on `socketServer.js` user mapping; inspect it before changing notification delivery.
- OAuth env vars exist, but confirm actual controller behavior before assuming a provider is fully configured.
- Payment checkout defaults to mock unless Razorpay env vars and provider are configured.

## Open Questions For The Human

These are worth asking before large product or architecture changes:

- Should this project be initialized as a Git repo, or is it intentionally delivered as a folder snapshot?
- Is the product brand `SGETAI`, `Get-Ai`, or `SGETAI`? The footer currently shows `SGETAI`, while code/docs mostly say `SGETAI`.
- Are `frontend/dist` and installed `node_modules` supposed to stay in the working folder, or should future cleanup remove them from source control once Git exists?
- Is Razorpay the intended production payment provider, or is mock checkout acceptable for now?
- Should the backend README be regenerated from this source analysis to remove stale sections and mojibake?
- Are MongoDB Atlas vector indexes already configured in the target environment?
- Should frontend design remain LinkedIn-like, or is a distinct visual identity desired?
