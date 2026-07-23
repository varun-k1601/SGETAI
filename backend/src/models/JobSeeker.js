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
    endDate: Date
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
    // Pure stored preferences — no execution behind them yet. LinkedIn's public API doesn't grant
    // third-party apps the ability to send connection requests or messages (see linkedinConnection
    // below), so these only persist the seeker's intent for whenever that capability exists.
    autoConnectEnabled: { type: Boolean, default: false },
    autoDMEnabled: { type: Boolean, default: false },
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
    linkedinConnection: linkedinConnectionSchema
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeeker", jobSeekerSchema);
