# SGETAI Backend

A production-ready Node.js/Express REST API powering the SGETAI job search platform. Features passwordless OTP authentication, role-based access control, multimedia profile management via Supabase, social networking, real-time notifications (Socket.io), AI-powered job matching (Gemini), ATS scoring, LaTeX resume generation, RAG career agent, and automated Pro-tier auto-apply workers.

---

## Table of Contents

- [Quick Start Guide](#quick-start-guide)
- [Environment Variables](#environment-variables)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Server Initialization](#server-initialization)
- [Database Schema Architecture](#database-schema-architecture)
- [Reusable Sub-Schemas](#reusable-sub-schemas)
- [Utility Services](#utility-services)
- [AI Services](#ai-services)
- [Middleware](#middleware)
- [Background Workers](#background-workers)
- [API Endpoints](#api-endpoints)
  - [Authentication](#1-authentication-apiauth)
  - [Profile Management](#2-profile-management-apiprofile)
  - [Connections](#3-connections-apiconnections)
  - [Follows](#4-follows-apifollows)
  - [Job Seekers](#5-job-seekers-apiseekers)
  - [Organizations](#6-organizations-apiorganizations)
  - [Notifications](#7-notifications-apinotifications)
  - [Posts & Feed](#8-posts--feed-apiposts)
  - [Chat](#9-chat-apichat)
  - [Jobs & Applications](#10-jobs--applications-apijobs)
  - [Applications Management](#11-applications-management-apiapplications)
  - [Job Search](#12-job-search-apisearch)
  - [Analytics](#13-analytics-apianalytics)
  - [Verification](#14-verification-pipeline-apiverification)
  - [AI Recommendations](#15-ai-recommendations-apirecommendations)
  - [Pro Features](#16-pro-features-apipro)
- [Authentication Flow](#authentication-flow)
- [Privacy & Pro-Tier Rules](#privacy--pro-tier-rules)
- [AI Architecture](#ai-architecture)
- [Supabase Storage Sync Policy](#supabase-storage-sync-policy)
- [MongoDB Atlas Setup](#mongodb-atlas-setup)

---

## Quick Start Guide

### Prerequisites

- **Node.js** ≥ 18.x
- **MongoDB Atlas** cluster (or local MongoDB)
- **Supabase** project with a Storage bucket
- **Gmail account** with App Password enabled (for SMTP)
- **Google Gemini API key** (for AI features)

### Installation

```bash
# 1. Clone and navigate
cd SGETAI/backend

# 2. Install dependencies
npm install

# 3. Create .env file (see Environment Variables section below)
cp .env.example .env   # or create manually

# 4. Start the server
npm start
```

### On Startup, the Server Will:

1. ✅ Connect to MongoDB
2. ✅ Auto-provision a SuperAdmin (if `ADMIN_EMAIL` is set)
3. ✅ Verify email SMTP connection
4. ✅ Verify Supabase Storage connection
5. ✅ Initialize Socket.io for real-time notifications
6. ✅ Start background cron workers:
   - **Verification Cron** — daily sweep for pending verifications
   - **Midnight Cron** — resets daily quotas (resume gen + auto-apply count)
7. 🚀 Listen on configured `PORT`

---

## Environment Variables

Create a `.env` file in the `backend/` root:

```env
# ─── Server ──────────────────────────────────────────────────
PORT=5000

# ─── MongoDB ─────────────────────────────────────────────────
MONGO_URI=mongodb+srv://your_user:your_password@cluster0.xxxxx.mongodb.net/your_db_name

# ─── JWT (Auth) ──────────────────────────────────────────────
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# ─── JWT (Verification — Phase 3) ───────────────────────────
JWT_VERIFICATION_SECRET=your_verification_secret_here

# ─── Admin Auto-Provisioning ────────────────────────────────
ADMIN_EMAIL=admin@sgetai.com
ADMIN_PASS=Admin@123

# ─── Supabase Storage ───────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET=sgetai-uploads

# ─── Email (Nodemailer / Gmail SMTP) ────────────────────────
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# ─── Frontend URL (Verification Links — Phase 3) ────────────
FRONTEND_URL=http://localhost:3000

# ─── Gemini AI (Phase 4+) ───────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here
```

### Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ✅ | Server port (default: 5000) |
| `MONGO_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Secret for signing access tokens (1-day expiry) |
| `JWT_REFRESH_SECRET` | ✅ | Secret for signing refresh tokens (7-day expiry) |
| `JWT_VERIFICATION_SECRET` | ✅ | Secret for signing verification JWTs (manager emails) |
| `ADMIN_EMAIL` | ⚠️ | Auto-provisioned SuperAdmin email (skipped if unset) |
| `ADMIN_PASS` | ⚠️ | Auto-provisioned SuperAdmin password (bcrypt-hashed on startup) |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (server-side only, never expose) |
| `SUPABASE_BUCKET` | ✅ | Supabase Storage bucket name |
| `EMAIL_USER` | ✅ | Gmail address for SMTP (OTP + verification emails) |
| `EMAIL_PASS` | ✅ | Gmail App Password (not regular password) |
| `FRONTEND_URL` | ✅ | Base URL for verification links in emails |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI features (embeddings, ATS, resume gen, RAG) |

---

## Tech Stack

| Package | Purpose |
|---------|---------|
| `express` | Web framework |
| `mongoose` | MongoDB ODM |
| `dotenv` | Environment variable management |
| `cors` | Cross-origin resource sharing |
| `helmet` | HTTP security headers |
| `bcryptjs` | Password & OTP hashing |
| `jsonwebtoken` | JWT access & refresh tokens |
| `nodemailer` | Email delivery (SMTP) |
| `@supabase/supabase-js` | Supabase Storage SDK |
| `multer` | Multipart file upload handling |
| `uuid` | Unique filename generation |
| `socket.io` | Real-time notifications |
| `node-cron` | Background scheduled tasks |
| `@google/genai` | Gemini AI SDK (embeddings, LLM, structured output) |

---

## Project Structure

```
backend/
├── .env                                  # Environment variables (not committed)
├── package.json                          # Dependencies & scripts
│
└── src/
    ├── server.js                         # Express app, Mongoose connection, Socket.io, cron boot
    │
    ├── models/
    │   ├── Admin.js                      # SuperAdmin with bcrypt password hash
    │   ├── Application.js                # Job applications with ATS scoring
    │   ├── ChatSession.js                # Real-time chat sessions
    │   ├── Comment.js                    # Post comments
    │   ├── Connection.js                 # JobSeeker ↔ JobSeeker networking
    │   ├── Follow.js                     # JobSeeker → Organization follow
    │   ├── Job.js                        # Job postings with AI embedding + hiddenRoles
    │   ├── JobSeeker.js                  # Full profile with AI fields, auto-apply, quotas
    │   ├── Like.js                       # Post likes
    │   ├── Mentor.js                     # Mentor profiles
    │   ├── Notification.js               # Persistent notifications
    │   ├── Organization.js               # Companies with trust/verification settings
    │   ├── Otp.js                        # OTP with hashed code + 5-min TTL
    │   ├── Post.js                       # Social posts with media
    │   └── VerificationRequest.js        # Background check tracking
    │
    ├── controllers/
    │   ├── authController.js             # OTP send, register, login, admin login
    │   ├── profileController.js          # Profile CRUD + syncSeekerEmbedding
    │   ├── projectsController.js         # Projects array CRUD + embedding sync
    │   ├── certificationsController.js   # Certifications CRUD
    │   ├── researchController.js         # Research papers CRUD
    │   ├── achievementsController.js     # Achievements CRUD
    │   ├── connectionController.js       # Connection requests
    │   ├── followController.js           # Follow / unfollow / preferences
    │   ├── jobSeekerController.js        # Privacy-enforced seeker viewing
    │   ├── organizationController.js     # Pro-gated org viewing
    │   ├── notificationController.js     # Notification REST API
    │   ├── postController.js             # Post create / delete
    │   ├── engagementController.js       # Like / comment
    │   ├── feedController.js             # Paginated feed
    │   ├── chatController.js             # Chat initiation
    │   ├── jobController.js              # Job creation with AI embedding + hidden roles
    │   ├── jobSearchController.js        # Full-text job search
    │   ├── applicationController.js      # Apply with ATS scoring + status management
    │   ├── analyticsController.js        # Seeker analytics
    │   ├── verificationController.js     # Trust verification pipeline
    │   ├── recommendationController.js   # $vectorSearch job recommendations
    │   └── proFeaturesController.js      # Pro: pre-apply, resume gen, RAG agent, auto-apply
    │
    ├── routes/
    │   ├── auth.js                       # /api/auth/*
    │   ├── profile.js                    # /api/profile/*
    │   ├── connections.js                # /api/connections/*
    │   ├── follows.js                    # /api/follows/*
    │   ├── seekers.js                    # /api/seekers/*
    │   ├── organizations.js              # /api/organizations/*
    │   ├── notifications.js              # /api/notifications/*
    │   ├── posts.js                      # /api/posts/*
    │   ├── chat.js                       # /api/chat/*
    │   ├── jobs.js                       # /api/jobs/*
    │   ├── applications.js               # /api/applications/*
    │   ├── search.js                     # /api/search/*
    │   ├── analytics.js                  # /api/analytics/*
    │   ├── verification.js               # /api/verification/*
    │   ├── recommendations.js            # /api/recommendations/*
    │   └── proFeatures.js                # /api/pro/*
    │
    ├── middleware/
    │   ├── requireAuth.js                # JWT Bearer token verification
    │   ├── requireRole.js                # Role-based access factory
    │   ├── requirePro.js                 # Pro subscription DB verification
    │   └── upload.js                     # Multer memory storage + file validation
    │
    ├── services/
    │   ├── notificationService.js        # Save + Socket.io emit notifications
    │   ├── geminiService.js              # Embeddings, ATS eval, hidden roles extraction
    │   └── geminiGenerativeService.js    # Pre-apply check, LaTeX resume gen, RAG agent
    │
    ├── workers/
    │   ├── verificationCron.js           # Daily: 3-day grace period + 4-day reminder sweep
    │   ├── midnightCron.js               # Daily: reset resume + auto-apply quotas
    │   └── autoApplyWorker.js            # Background: pre-filter → ATS eval → auto-apply
    │
    └── utils/
        ├── email.js                      # Nodemailer SMTP transport
        ├── domainCheck.js                # Email ↔ website domain comparator
        ├── supabaseService.js            # Supabase upload/delete utility
        ├── socketServer.js               # Socket.io initialization + user mapping
        └── resume.template.txt           # LaTeX resume template for AI generation
```

---

## Server Initialization

**File:** `src/server.js`

```javascript
// Global middleware stack
app.use(helmet());       // Security headers
app.use(cors());         // Cross-origin access
app.use(express.json()); // JSON body parsing

// 16 route mounts
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/seekers', seekerRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/pro', proFeaturesRoutes);
```

### Boot Sequence

1. Connect to MongoDB
2. Auto-provision SuperAdmin (bcrypt hash, idempotent)
3. Verify SMTP email connection
4. Verify Supabase Storage connection
5. Initialize Socket.io with HTTP server
6. Start cron workers: **verificationCron** + **midnightCron**

---

## Database Schema Architecture

### 1. OTP Schema (`otps`)

**File:** `models/Otp.js`

| Field | Type | Details |
|-------|------|---------|
| `email` | String | Required, lowercase, trimmed, indexed |
| `otp` | String | Required, bcrypt-hashed before storage |
| `purpose` | String | Enum: `'LOGIN'`, `'REGISTER'` |
| `createdAt` | Date | **TTL: 300 seconds (5 minutes)** — auto-deleted |

---

### 2. JobSeeker Schema (`jobseekers`)

**File:** `models/JobSeeker.js` — The most complex schema in the system.

#### Identity Fields

| Field | Type | Details |
|-------|------|---------|
| `firstName` | String | Required, trimmed |
| `lastName` | String | Required, trimmed |
| `email` | String | Required, unique, lowercase, trimmed |
| `phone` | String | Trimmed — stripped from public API responses |
| `profilePicture` | MediaSchema | `{ url, filePath, fileType }` |
| `backgroundVideo` | MediaSchema | `{ url, filePath, fileType }` |
| `tagline` | String | Trimmed |
| `bio` | String | — |
| `careerObjective` | String | — |
| `gender` | String | — |
| `dateOfBirth` | Date | — |

#### Account Status

| Field | Type | Details |
|-------|------|---------|
| `isPro` | Boolean | Default: `false` — gates Pro-tier features |
| `profileVisibility` | String | Enum: `'Public'`, `'Private'`, `'NetworkOnly'`. Default: `'Public'` |

#### Classification & Education

| Field | Type |
|-------|------|
| `currentStatus` | String (Enum: `'Student'`, `'Professional'`, `'Unemployed'`) |
| `universityName` | String |
| `degree` | String |
| `major` | String |
| `graduationYear` | Number |
| `currentGPA` | Number |

#### Experience Array (Sub-document)

| Field | Type | Details |
|-------|------|---------|
| `jobTitle` | String | Trimmed |
| `companyName` | String | Trimmed |
| `startDate` / `endDate` | Date | — |
| `isCurrent` | Boolean | Default: `false` |
| `description` | String | — |
| `managerEmail` | String | Required — for background verification |
| `trustScore` | Number | Default: `0` |
| `verificationStatus` | String | Enum: `'Pending'`, `'Verified'`, `'Rejected'` |

#### Education Array

| Field | Type |
|-------|------|
| `institution`, `degree`, `fieldOfStudy` | String |
| `startDate`, `endDate` | Date |

#### Skills, Links & Preferences

| Field | Type | Details |
|-------|------|---------|
| `skills` | [String] | — |
| `portfolioUrl`, `linkedinUrl`, `githubUrl` | String | — |
| `openToWork` | Boolean | Default: `false` |
| `preferredRoles` | [String] | — |
| `expectedSalary` | Number | — |

#### Multimedia Profile Arrays

- **`licensesAndCertifications[]`** — title, description, media
- **`researchAndPapers[]`** — title, paperType (Conference/Journal/Whitepaper/Other), description, media
- **`projects[]`** — title, description, dates, links, mediaFiles (max 5), documents (max 3)
- **`achievements[]`** — title, description, media

#### AI & Pro Fields (Phases 4-6)

| Field | Type | Details |
|-------|------|---------|
| `embedding` | [Number] | 768-dim vector, `select: false` |
| `resumesGeneratedToday` | Number | Daily quota tracker (max 30) |
| `lastResumeResetDate` | Date | Last midnight reset timestamp |
| `hiddenRoles` | [String] | AI-generated role tags, `select: false` |
| `autoApplyPreferences.enabled` | Boolean | Default: `false` |
| `autoApplyPreferences.matchThreshold` | Number | Default: `70` (0-100) |
| `autoApplyPreferences.maxDailyApplications` | Number | Default: `10` (1-50) |
| `autoApplyPreferences.preferredLocations` | [String] | Location filter |
| `autoApplyPreferences.excludedCompanies` | [String] | Company exclusion list |
| `autoApplyCountToday` | Number | Daily auto-apply counter |

---

### 3. Organization Schema (`organizations`)

**File:** `models/Organization.js`

| Field | Type | Details |
|-------|------|---------|
| `companyName` | String | Required |
| `email` | String | Required, unique, corporate domain |
| `phone`, `logo`, `industry` | String | — |
| `companySize`, `websiteUrl`, `linkedinPage` | String | — |
| `description`, `taxId`, `registrationNumber` | String | — |
| `headquartersLocation` | String | — |
| `foundedYear` | Number | — |
| `verificationStatus` | String | Enum: `'Pending'`, `'Verified'`, `'Rejected'`, `'OnHold'` |
| `domainMatched` | Boolean | Set during registration |
| `activeJobCredits` | Number | Default: `0` |
| `subscriptionTier` | String | — |
| `representativeDetails` | Sub-doc | `{ name, role, email, phone }` — Pro-gated |
| `autoRejectOnTrustScore` | Boolean | Default: `false` |
| `trustScoreThreshold` | Number | Default: `50` |

---

### 4. Mentor Schema (`mentors`)

**File:** `models/Mentor.js` — Similar to JobSeeker with expertise/booking fields.

| Key Fields | Type |
|------------|------|
| `firstName`, `lastName`, `email` | String (required) |
| `headline`, `bio`, `careerObjective` | String |
| `areasOfExpertise` | [String] |
| `yearsOfExperience`, `hourlyRate` | Number |
| `currentCompany`, `currentRole` | String |
| `availabilitySchedule` | Mixed (JSON) |
| Multimedia arrays | Same as JobSeeker |

---

### 5. Admin Schema (`admins`)

| Field | Type | Details |
|-------|------|---------|
| `email` | String | Required, unique |
| `passwordHash` | String | bcrypt hash |
| `role` | String | Enum: `'SuperAdmin'`, `'Moderator'` |

---

### 6. Job Schema (`jobs`)

**File:** `models/Job.js`

| Field | Type | Details |
|-------|------|---------|
| `title` | String | Required |
| `description` | String | — |
| `organizationId` | ObjectId → Organization | Required |
| `location`, `industry` | String | — |
| `type` | String | Enum: Full-time/Part-time/Contract/Internship/Remote |
| `salary` | `{ min, max, currency }` | — |
| `requirements`, `skills`, `skillsRequired` | [String] | — |
| `isActive` | Boolean | — |
| `status` | String | Enum: `'Active'`, `'Closed'` |
| `embedding` | [Number] | 768-dim, `select: false` |
| `hiddenRoles` | [String] | AI-generated, `select: false` |

**Indexes:**
- `{ organizationId: 1, createdAt: -1 }` — org dashboard
- **Text Index** (`title:5, skillsRequired:3, description:1`) — keyword search
- `{ status: 1, location: 1, industry: 1 }` — compound filter

---

### 7. Application Schema (`applications`)

| Field | Type | Details |
|-------|------|---------|
| `jobId` | ObjectId → Job | Required |
| `jobSeekerId` | ObjectId → JobSeeker | Required |
| `organizationId` | ObjectId → Organization | Required |
| `status` | String | Enum: Pending/UnderReview/Accepted/Rejected |
| `atsScore` | Number | AI-generated match score (0-100) |
| `atsTag` | String | AI-generated tag (e.g., "Strong fit") |
| `trustScore`, `trustScoreTag` | Number/String | From verification |
| `verificationStatus` | String | Enum: Pending/InProgress/Verified |

**Unique compound index:** `{ jobId, jobSeekerId }` — prevents double-applying.

---

### 8-10. Supporting Schemas

| Schema | File | Purpose |
|--------|------|---------|
| **Connection** | `Connection.js` | `requester` ↔ `recipient` with status. Unique `{ requester, recipient }` |
| **Follow** | `Follow.js` | `jobSeekerId` → `organizationId` with notification preferences |
| **Notification** | `Notification.js` | Persistent notifications with `isRead`, multiple types |
| **Post** | `Post.js` | Social posts with media, `likesCount`, `commentsCount` |
| **Like** | `Like.js` | Polymorphic `userId` + `userModel` on posts |
| **Comment** | `Comment.js` | Polymorphic `userId` + `userModel` on posts |
| **ChatSession** | `ChatSession.js` | Real-time chat sessions |
| **VerificationRequest** | `VerificationRequest.js` | Tracks 3-day grace + 4-day reminder pipeline |

---

## Reusable Sub-Schemas

### MediaSchema

```javascript
{ url: String, filePath: String, fileType: 'image'|'video'|'document' }
```

Every uploaded file stores `url` (display) + `filePath` (Supabase deletion). Zero orphaned files guaranteed.

---

## Utility Services

| Service | File | Exports |
|---------|------|---------|
| **Email** | `utils/email.js` | `sendEmail(to, subject, html)`, `sendOtpEmail()`, `verifyEmailConnection()` |
| **Domain Check** | `utils/domainCheck.js` | `domainCheck(email, websiteUrl)` — root domain comparison |
| **Supabase** | `utils/supabaseService.js` | `uploadFile(buffer, name, mime, folder)`, `deleteFiles(paths[])`, `verifySupabaseConnection()` |
| **Socket.io** | `utils/socketServer.js` | `init(httpServer)`, `getIO()` — user mapping + real-time emit |

---

## AI Services

### `services/geminiService.js` — Core AI (Phases 4 & 6)

| Method | Model | Input → Output |
|--------|-------|----------------|
| `generateEmbedding(text)` | `text-embedding-004` | Text → 768-dim vector (or `null`) |
| `evaluateCandidateMatch(candidateText, jobText)` | `gemini-2.5-flash` | → `{ score, tag, reasoning }` |
| `extractHiddenRoles(text)` | `gemini-2.5-flash` | → `["frontend developer", "data scientist", ...]` |

### `services/geminiGenerativeService.js` — Pro Generative AI (Phase 5)

| Method | Model | Input → Output |
|--------|-------|----------------|
| `evaluatePreApply(seekerText, jobText)` | `gemini-2.5-flash` | → `{ score, isLowMatch, warningMessage, actionableAdvice[] }` |
| `generateLatexResume(profile, jobDesc, template)` | `gemini-2.5-pro` | → Raw LaTeX string |
| `chatWithRagAgent(message, history, profile, jobs)` | `gemini-2.5-pro` | → Conversational AI response |

All methods are **fault-tolerant** — return `null` or `[]` on failure, never crash the caller.

---

## Middleware

| Middleware | File | Description |
|------------|------|-------------|
| **requireAuth** | `requireAuth.js` | JWT Bearer verification → attaches `{ id, role, email }` to `req.user` |
| **requireRole** | `requireRole.js` | Factory: `requireRole(['SuperAdmin'])` → 403 if not in allowed roles |
| **requirePro** | `requirePro.js` | DB-verified Pro check (not just JWT) → 403 if `isPro !== true` |
| **upload** | `upload.js` | Multer memory storage, 50MB limit. Exports: `uploadSingle`, `uploadArray`, `uploadProjectFiles` |

---

## Background Workers

### 1. Verification Cron (`workers/verificationCron.js`)

**Schedule:** Daily at midnight

- Sweeps `VerificationRequest` collection for pending verifications
- 3-day grace period: if manager hasn't responded in 3 days, begins reminder loop
- 4-day reminder loop: sends follow-up emails every 4 days
- Uses JWT-secured email links for manager submission

### 2. Midnight Cron (`workers/midnightCron.js`)

**Schedule:** Daily at `0 0 * * *` (midnight)

- Resets `resumesGeneratedToday` → 0 (Pro resume quota)
- Resets `autoApplyCountToday` → 0 (auto-apply daily limit)
- Updates `lastResumeResetDate` to current timestamp

### 3. Auto-Apply Worker (`workers/autoApplyWorker.js`)

**Trigger:** Fire-and-forget from `jobController.createJob()`

1. Fetches new job with `+hiddenRoles +embedding`
2. **Pre-filter query:** `isPro: true`, `autoApplyPreferences.enabled: true`, `hiddenRoles: { $in: job.hiddenRoles }`
3. For each pre-filtered candidate:
   - Check location preferences & excluded companies
   - Run ATS evaluation via Gemini
   - If score ≥ `matchThreshold` → create Application + notify both parties
   - Catch duplicate errors (11000) gracefully
4. Increment `autoApplyCountToday` atomically

---

## API Endpoints

### 1. Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/send-otp` | ❌ | Generate & email 6-digit OTP |
| `POST` | `/api/auth/register/organization` | ❌ | Verify OTP → domain check → create org |
| `POST` | `/api/auth/register/:role` | ❌ | Register seeker or mentor |
| `POST` | `/api/auth/login` | ❌ | Verify OTP → find user → return JWTs |
| `POST` | `/api/auth/admin/login` | ❌ | Email + password → bcrypt verify |

---

### 2. Profile Management (`/api/profile`)

**All routes require JWT authentication.**

| Method | Endpoint | Middleware | Description |
|--------|----------|-----------|-------------|
| `PUT` | `/api/profile/picture` | `uploadSingle` | Upload/replace profile picture |
| `DELETE` | `/api/profile/picture` | — | Remove profile picture |
| `PUT` | `/api/profile/background-video` | `uploadSingle` | Upload/replace background video |
| `DELETE` | `/api/profile/background-video` | — | Remove background video |
| `PUT` | `/api/profile/career-objective` | — | Update career objective + triggers embedding sync |
| `GET` | `/api/profile/projects` | — | List all projects |
| `POST` | `/api/profile/projects` | `uploadProjectFiles` | Add project (triggers embedding sync) |
| `PUT` | `/api/profile/projects/:projectId` | `uploadProjectFiles` | Update project (triggers embedding sync) |
| `DELETE` | `/api/profile/projects/:projectId` | — | Delete project (triggers embedding sync) |
| `POST` | `/api/profile/certifications` | `uploadSingle` | Add certification |
| `PUT` | `/api/profile/certifications/:certId` | `uploadSingle` | Update certification |
| `DELETE` | `/api/profile/certifications/:certId` | — | Delete certification |
| `POST` | `/api/profile/research` | `uploadSingle` | Add research paper |
| `PUT` | `/api/profile/research/:researchId` | `uploadSingle` | Update research paper |
| `DELETE` | `/api/profile/research/:researchId` | — | Delete research paper |
| `POST` | `/api/profile/achievements` | `uploadSingle` | Add achievement |
| `PUT` | `/api/profile/achievements/:achievementId` | `uploadSingle` | Update achievement |
| `DELETE` | `/api/profile/achievements/:achievementId` | — | Delete achievement |

> **AI Sync:** Profile and project changes trigger `syncSeekerEmbedding()` which generates a new embedding vector AND extracts hidden roles in parallel (fire-and-forget, non-blocking).

---

### 3. Connections (`/api/connections`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/connections/request/:recipientId` | Send connection request (seekers only) |
| `PUT` | `/api/connections/respond/:connectionId` | Respond: Accept / Reject / Ignore |
| `GET` | `/api/connections/pending` | Get pending requests (excludes Ignored) |
| `GET` | `/api/connections` | Get all accepted connections |

---

### 4. Follows (`/api/follows`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/follows/:organizationId` | Follow an organization |
| `DELETE` | `/api/follows/:organizationId` | Unfollow |
| `PUT` | `/api/follows/:organizationId/preferences` | Update notification prefs (notifyJobs is Pro-gated) |
| `GET` | `/api/follows` | List followed organizations |

---

### 5. Job Seekers (`/api/seekers`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/seekers/visibility` | Update profile visibility (NetworkOnly is Pro-gated) |
| `GET` | `/api/seekers/:id` | View seeker profile (privacy-enforced) |

---

### 6. Organizations (`/api/organizations`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/organizations/:id` | View org profile (representativeDetails Pro-gated) |

---

### 7. Notifications (`/api/notifications`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notifications` | Get notifications (paginated, newest-first) |
| `PUT` | `/api/notifications/:id/read` | Mark single notification as read |
| `PUT` | `/api/notifications/read-all` | Mark all notifications as read |

---

### 8. Posts & Feed (`/api/posts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts/feed` | Paginated feed |
| `POST` | `/api/posts` | Create post with media |
| `DELETE` | `/api/posts/:id` | Delete post + cleanup media |
| `POST` | `/api/posts/:id/like` | Toggle like |
| `POST` | `/api/posts/:id/comment` | Add comment |

---

### 9. Chat (`/api/chat`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat/initiate` | Initiate or retrieve a chat session (tier-gated) |

---

### 10. Jobs & Applications (`/api/jobs`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/jobs` | ✅ Org | Create job (generates embedding + hidden roles, fires auto-apply worker, notifies Pro followers) |
| `POST` | `/api/jobs/:jobId/apply` | ✅ Seeker | Apply to job (runs real-time ATS evaluation via Gemini) |
| `GET` | `/api/jobs/:jobId/applications` | ✅ Org (owner) | View applications for a job |

---

### 11. Applications Management (`/api/applications`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/applications/:id/status` | Update application status (org only) → notifies seeker |

---

### 12. Job Search (`/api/search`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search/jobs` | Full-text search using MongoDB `$text` index (weighted scoring) |

---

### 13. Analytics (`/api/analytics`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/seekers` | Seeker application analytics |

---

### 14. Verification Pipeline (`/api/verification`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/verification/:applicationId/trigger` | ✅ Org | Trigger background check → email manager with JWT link |
| `POST` | `/api/verification/submit` | ❌ Public | Manager submits rating → score + tag + auto-reject engine |

**Flow:** Org triggers → extracts latest experience → JWT email to manager → 3-day grace → 4-day reminders via cron → manager rates → trust score calculated → optional auto-reject.

---

### 15. AI Recommendations (`/api/recommendations`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/recommendations/jobs` | ✅ Seeker | AI-powered job recommendations via MongoDB Atlas `$vectorSearch` |

Falls back to latest active jobs if seeker has no embedding or vector index isn't configured.

---

### 16. Pro Features (`/api/pro`)

**All routes require `requireAuth` + `requirePro`.**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pro/jobs/:jobId/pre-apply-check` | AI match evaluation: score + isLowMatch + warning + actionable advice |
| `POST` | `/api/pro/jobs/:jobId/generate-resume` | AI LaTeX resume generation (30/day quota). Returns raw `.tex` string |
| `POST` | `/api/pro/agent/chat` | RAG career agent: `$vectorSearch` retrieves top jobs → injected into Gemini context |
| `GET` | `/api/pro/auto-apply/preferences` | Get auto-apply settings + daily count |
| `PUT` | `/api/pro/auto-apply/preferences` | Update auto-apply settings (blocked if hiddenRoles empty) |

---

## Authentication Flow

### Registration

```
1. POST /api/auth/send-otp { email, purpose: "REGISTER" }
2. Server → 6-digit OTP → bcrypt hash → store in DB → email plain OTP
3. POST /api/auth/register/:role { email, otp, ...fields }
   (For Org: domain check → if no match → OnHold, no JWT)
4. Server → validate OTP → create record → return JWTs
```

### Login

```
1. POST /api/auth/send-otp { email, purpose: "LOGIN" }
2. Server → verify user exists → check OnHold → send OTP
3. POST /api/auth/login { email, otp }
4. Server → validate OTP → return { accessToken, refreshToken, role, userId }
```

### Token Structure

```javascript
// Access Token (1-day expiry)
{ id: userId, role: 'seeker'|'mentor'|'organization', email }

// Refresh Token (7-day expiry)
{ id: userId, role: 'seeker'|'mentor'|'organization', email }
```

---

## Privacy & Pro-Tier Rules

| Feature | Normal User | Pro User |
|---------|-------------|----------|
| Profile visibility options | `Public`, `Private` | + `NetworkOnly` |
| View org representative details | ❌ Hidden | ✅ Visible |
| Follow org job notifications | ❌ Blocked (403) | ✅ Allowed |
| Pre-apply match check | ❌ | ✅ |
| AI LaTeX resume generation | ❌ | ✅ (30/day) |
| RAG career agent | ❌ | ✅ |
| Auto-apply to jobs | ❌ | ✅ (configurable) |
| AI job recommendations | ✅ | ✅ |
| ATS scoring on applications | ✅ (auto) | ✅ (auto) |
| Public profile phone visibility | ❌ Stripped | ❌ Stripped |

---

## AI Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GEMINI AI LAYER                       │
├─────────────────────┬───────────────────────────────────┤
│  text-embedding-004 │  Embedding generation (768-dim)   │
│  gemini-2.5-flash   │  ATS eval, pre-apply, hidden      │
│                     │  roles extraction (fast/cheap)     │
│  gemini-2.5-pro     │  LaTeX resume gen, RAG career     │
│                     │  agent (deep context window)       │
└─────────────────────┴───────────────────────────────────┘

Data Flow:
1. Job Created     → embedding + hiddenRoles generated → saved to Job
2. Profile Updated → embedding + hiddenRoles generated → saved to JobSeeker (fire-and-forget)
3. Application     → ATS eval (seeker vs job) → atsScore + atsTag saved to Application
4. Recommendations → seeker.embedding → $vectorSearch on jobs → ranked results
5. Auto-Apply      → hiddenRoles pre-filter → ATS eval → threshold → Application created
```

---

## Supabase Storage Sync Policy

**Zero Orphaned Files — Enforced at every CRUD operation:**

| Operation | Supabase Action |
|-----------|-----------------|
| **Add** (with file) | Upload → save to DB. If DB fails → **rollback: delete uploaded file** |
| **Update** (replace file) | Delete old → upload new → save to DB. If fails → **rollback: delete new file** |
| **Delete** | Collect all `filePath` strings → batch delete from Supabase → remove from DB |

### Folder Structure

```
{SUPABASE_BUCKET}/
├── profile-pictures/    ← Profile picture uploads
├── background-videos/   ← Background video uploads
├── projects/
│   ├── media/           ← Project images & videos
│   └── documents/       ← Project pdf/docx/pptx
├── certifications/      ← Certification attachments
├── research/            ← Research paper attachments
└── achievements/        ← Achievement attachments
```

---

## MongoDB Atlas Setup

### Required Indexes

The following are created automatically by Mongoose:
- **Text Index** on `jobs` collection (`title:5, skillsRequired:3, description:1`)
- **Compound unique indexes** on `applications` and `connections`

### Required Vector Search Indexes (Manual Setup)

Create these in the **Atlas UI → Search → Create Vector Search Index**:

**1. Jobs Collection — `vector_index`**

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "status" }
  ]
}
```

**2. JobSeekers Collection — `vector_index`** (same name)

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" }
  ]
}
```

> ⚠️ Without these indexes, vector search falls back to latest results gracefully. The app will not crash.

---

## License

ISC
