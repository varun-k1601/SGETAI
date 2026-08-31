const mongoose = require("mongoose");
const {
  mediaSchema,
  certificationSchema,
  researchSchema,
  achievementSchema,
  projectSchema
} = require("./subschemas");

function hasValidEmbeddingLength(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 768);
}

const experienceSchema = new mongoose.Schema(
  {
    jobTitle: { type: String, trim: true },
    companyName: { type: String, trim: true },
    startDate: Date,
    endDate: Date,
    isCurrent: { type: Boolean, default: false },
    description: { type: String, trim: true },
    managerEmail: { type: String, trim: true, lowercase: true },
    trustScore: { type: Number, default: 0 },
    verificationStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      default: "Pending"
    }
  },
  { _id: true }
);

const educationSchema = new mongoose.Schema(
  {
    institution: { type: String, trim: true },
    degree: { type: String, trim: true },
    fieldOfStudy: { type: String, trim: true },
    startDate: Date,
    endDate: Date,
    /* PER-DEGREE GRADE. Until this existed the only grade anywhere in the model was the top-level
       `currentGPA` scalar, which describes ONE degree; a candidate with an M.Tech and a B.Tech
       could store a grade for the most recent and had nowhere at all to put the other. The
       generator was behaving correctly by attributing `currentGPA` to the most recent entry only —
       the B.Tech rendered blank because the data had nowhere to live.

       STRING, NOT NUMBER, and that is the load-bearing decision. Real values carry their scale:
       "3.68/4", "8.68/10", "78.4%", "First Class with Distinction". A Number field keeps 8.68 and
       silently destroys the /10, after which 8.68 is indistinguishable from a 4-point GPA that
       would be impossible. formatGpa passes any value carrying its own scale through untouched.

       `currentGPA` is untouched and still works: it remains the whole-profile scalar the
       onboarding form and every existing profile write to, and the generator falls back to it for
       the most recent entry when that entry has no grade of its own. */
    gpa: { type: String, trim: true }
  },
  { _id: true }
);

const skillGroupSchema = new mongoose.Schema(
  {
    category: { type: String, trim: true },
    skills: { type: [String], default: [] }
  },
  { _id: true }
);

const autoApplyPreferencesSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    tailoredResume: { type: Boolean, default: false },
    matchThreshold: { type: Number, default: 70, min: 0, max: 100 },
    // The two channels a recruiter introduction can use, consented to independently — see
    // recruiterIntroductionWorker.js, which reads both per candidate.
    //
    // These are IN-PLATFORM ONLY and always have been: they do not touch LinkedIn, and no amount
    // of scope on linkedinConnection below would let them. LinkedIn's public API grants third-party
    // apps no ability to send connection requests or messages at all, so the only thing these can
    // ever mean is this app's own connections and chat.
    //
    // autoConnectEnabled authorizes the introduction itself (the RecruiterIntroduction request to
    // the HR member, plus the Follow/ChatSession that makes them reachable). autoDMEnabled
    // additionally authorizes an AI-drafted first message sent under the seeker's own name, and is
    // meaningless without the former — "send a first message AFTER connecting".
    autoConnectEnabled: { type: Boolean, default: false },
    autoDMEnabled: { type: Boolean, default: false },
    // The master switch for the same feature: whether a published job may trigger an introduction
    // at all. Kept separate from the two channel flags so turning the feature off is one action
    // rather than two, and so a seeker's channel choices survive toggling it back on. Defaults to
    // false — outreach is never opted into on a seeker's behalf.
    autoIntroduceToRecruiters: { type: Boolean, default: false },
    maxDailyApplications: { type: Number, default: 10, min: 1, max: 50 },
    preferredLocations: { type: [String], default: [] },
    excludedCompanies: { type: [String], default: [] },
    rolePreferences: { type: [String], default: [] },
    locationPreferences: { type: [String], default: [] },
    minSalary: { type: Number, default: undefined },
    // Gates the exclusion/location/salary skip checks in autoApplyWorker.js — does NOT affect
    // matchThreshold-based scoring, which is a separate core matching concept, not a guardrail.
    safetyGuardrailsEnabled: { type: Boolean, default: true }
  },
  { _id: false }
);

// Catch-all for resume content that doesn't map to any fixed profile field (e.g. "Relevant
// Coursework", "Extracurricular", "Publications"). Entries are intentionally loose: a flat
// list item (e.g. a course name) only fills "title", while a dated role/activity entry also
// fills organization/dates/description — same shape, different fields populated.
const customSectionEntrySchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    organization: { type: String, trim: true },
    startDate: Date,
    endDate: Date,
    description: { type: String, trim: true }
  },
  { _id: true }
);

const customSectionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    entries: { type: [customSectionEntrySchema], default: [] }
  },
  { _id: true }
);

// Proves who the seeker is on LinkedIn, and — only when `scopes` includes "w_member_social" —
// also allows publishing a single post to that member's own feed on their explicit click (see
// publishLinkedInPost in proFeaturesController.js). This still does NOT grant any
// connection-sending, messaging, or reply-tracking capability; LinkedIn restricts that to its
// vetted Talent/Marketing Partner program regardless of what scopes this app requests.
const linkedinConnectionSchema = new mongoose.Schema(
  {
    linkedinUserId: { type: String, trim: true },
    displayName: { type: String, trim: true },
    connectedAt: Date,
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    // What the member actually granted at LinkedIn's consent screen (from the OAuth token
    // response's own `scope` field) — checked explicitly before publishing rather than assumed
    // from what we merely requested, since a member could deny part of a requested scope set.
    scopes: { type: [String], default: [] },
    expiresAt: Date
  },
  { _id: false }
);

const jobSeekerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      select: false
    },
    phone: { type: String, trim: true },
    profilePicture: mediaSchema,
    backgroundVideo: mediaSchema,
    defaultResume: {
      media: mediaSchema,
      originalName: { type: String, trim: true },
      uploadedAt: Date
    },
    tagline: { type: String, trim: true },
    bio: { type: String, trim: true },
    careerObjective: { type: String, trim: true },
    gender: { type: String, trim: true },
    dateOfBirth: Date,
    isPro: { type: Boolean, default: false },
    // Resume layout override. Unset means "whichever of the six this candidate's _id hashes to",
    // which is stable for them forever; setting it pins a different one. Deliberately NOT defaulted
    // to a variant — a stored default would freeze whichever layout happened to be picked at
    // signup and make a future change to the selection invisible to existing users.
    resumeTemplateVariant: {
      type: String,
      enum: ["a", "b", "c", "d", "e", "f"],
      default: undefined
    },
    // How many resumes this candidate has generated, ever. Drives the layout rotation so each
    // generation uses a different one of the six. DELIBERATELY HAS NO DEFAULT: an existing
    // candidate must read `undefined` here so resumeVariantRotation seeds them from their real
    // GeneratedArtifact history instead of restarting the cycle. Monotonic, never reset — unlike
    // resumesGeneratedToday, which is a daily quota counter and would rewind the rotation nightly.
    resumeGenerationCount: {
      type: Number,
      min: 0,
      default: undefined
    },
    profileVisibility: {
      type: String,
      enum: ["Public", "Private", "NetworkOnly"],
      default: "Public"
    },
    currentStatus: {
      type: String,
      enum: ["Student", "Professional", "Unemployed"]
    },
    universityName: { type: String, trim: true },
    degree: { type: String, trim: true },
    major: { type: String, trim: true },
    graduationYear: Number,
    currentGPA: Number,
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    skillGroups: { type: [skillGroupSchema], default: [] },
    skills: { type: [String], default: [] },
    portfolioUrl: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    githubUrl: { type: String, trim: true },
    openToWork: { type: Boolean, default: false },
    preferredRoles: { type: [String], default: [] },
    expectedSalary: Number,
    licensesAndCertifications: { type: [certificationSchema], default: [] },
    researchAndPapers: { type: [researchSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
    achievements: { type: [achievementSchema], default: [] },
    customSections: { type: [customSectionSchema], default: [] },
    embedding: {
      type: [Number],
      select: false,
      default: undefined,
      validate: {
        validator: hasValidEmbeddingLength,
        message: "embedding must contain exactly 768 dimensions."
      }
    },
    resumesGeneratedToday: { type: Number, default: 0 },
    lastResumeResetDate: Date,
    hiddenRoles: { type: [String], select: false, default: [] },
    // Stable per-result keys (see activityStream key generation in ProSeekerDashboard.jsx) the
    // seeker has dismissed from their AI Activity Stream view — the underlying AutoApplyRun
    // documents are never touched, this only filters what's rendered.
    dismissedActivityKeys: { type: [String], default: [] },
    subscriptionPlan: {
      type: String,
      enum: ["monthly", "yearly", null],
      default: null
    },
    subscriptionStatus: {
      type: String,
      enum: ["None", "Active", "Expired", "Cancelled"],
      default: "None"
    },
    proStartedAt: Date,
    proExpiresAt: Date,
    autoApplyPreferences: {
      type: autoApplyPreferencesSchema,
      default: () => ({})
    },
    autoApplyCountToday: { type: Number, default: 0 },
    // Separate budget from autoApplyCountToday — an auto-application and an unsolicited message to
    // a named person are different kinds of spend against a seeker's reputation, so exhausting one
    // must not silently consume the other. Reset by the same midnight cron.
    recruiterIntroCountToday: { type: Number, default: 0 },
    linkedinConnection: linkedinConnectionSchema
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeeker", jobSeekerSchema);
