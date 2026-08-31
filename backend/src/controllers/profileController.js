const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { findUserByAuth } = require("../utils/userModels");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const { extractResumeText, getResumeTextQuality } = require("../utils/resumeTextExtractor");
const { parseResumeToProfile } = require("../services/resumeProfileParser");
const { fireAndForget, syncSeekerEmbedding } = require("../services/aiSyncService");
const {
  uploadMediaDescriptor,
  cleanupUploadedMedia,
  clonePlain,
  safeDeleteStoredFiles
} = require("../utils/mediaStorage");
const { downloadFile } = require("../utils/supabaseService");
const { attachMediaUrl, attachMediaUrls } = require("../services/mediaUrlService");

const seekerEditableFields = [
  "firstName",
  "lastName",
  "username",
  "phone",
  "tagline",
  "bio",
  "careerObjective",
  "gender",
  "dateOfBirth",
  "currentStatus",
  "universityName",
  "degree",
  "major",
  "graduationYear",
  "currentGPA",
  "experience",
  "education",
  "skillGroups",
  "skills",
  "portfolioUrl",
  "linkedinUrl",
  "githubUrl",
  "openToWork",
  "preferredRoles",
  "expectedSalary",
  "customSections",
  // Lets a candidate pin one of the six resume layouts instead of the one their _id hashes to.
  "resumeTemplateVariant"
];

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);

  if (!username) {
    throw new ApiError(400, "Username is required.");
  }

  if (username.length < 3 || username.length > 30) {
    throw new ApiError(400, "Username must be between 3 and 30 characters.");
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    throw new ApiError(400, "Username can only contain lowercase letters, numbers, and underscores.");
  }

  return username;
}

async function assertUsernameAvailable(username, authUser) {
  const [seeker, organization] = await Promise.all([
    JobSeeker.findOne({ username }).select("_id"),
    Organization.findOne({ username }).select("_id")
  ]);
  const conflicts = [
    { role: "seeker", user: seeker },
    { role: "organization", user: organization }
  ].filter((item) => item.user);
  const hasConflict = conflicts.some((item) => {
    return item.role !== authUser.role || item.user._id.toString() !== authUser.id;
  });

  if (hasConflict) {
    throw new ApiError(409, "This username is already taken.");
  }
}

const organizationEditableFields = [
  "companyName",
  "username",
  "phone",
  "industry",
  "companySize",
  "websiteUrl",
  "linkedinPage",
  "description",
  "taxId",
  "registrationNumber",
  "headquartersLocation",
  "foundedYear",
  "representativeDetails",
  "autoRejectOnTrustScore",
  "trustScoreThreshold"
];

function pickAllowedUpdates(source, allowedFields) {
  return allowedFields.reduce((updates, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      updates[field] = source[field];
    }
    return updates;
  }, {});
}

function getEditableFields(role) {
  if (role === "seeker") {
    return seekerEditableFields;
  }

  if (role === "organization") {
    return organizationEditableFields;
  }

  return [];
}

function cleanStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function normalizeSkillGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      ...(group._id ? { _id: group._id } : {}),
      category: String(group.category || "").trim(),
      skills: cleanStringList(group.skills)
    }))
    .filter((group) => group.category || group.skills.length);
}

function flattenSkillGroups(groups = []) {
  return cleanStringList(groups.flatMap((group) => group.skills || []));
}

// A custom-section entry can be a bare list item (course name — only "title" set) or a dated
// role/activity entry (title + organization + dates + description), so nothing beyond "title"
// is required.
function normalizeCustomSections(sections = []) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => ({
      ...(section._id ? { _id: section._id } : {}),
      title: String(section.title || "").trim(),
      entries: (Array.isArray(section.entries) ? section.entries : [])
        .map((entry) => ({
          ...(entry._id ? { _id: entry._id } : {}),
          title: String(entry.title || "").trim(),
          organization: String(entry.organization || "").trim(),
          startDate: entry.startDate || undefined,
          endDate: entry.endDate || undefined,
          description: String(entry.description || "").trim()
        }))
        .filter((entry) => entry.title || entry.description)
    }))
    .filter((section) => section.title && section.entries.length);
}

function getContentTypeFromMedia(media) {
  const filePath = String(media?.filePath || "").toLowerCase();

  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".gif")) return "image/gif";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".mp4")) return "video/mp4";
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".mov")) return "video/quicktime";

  if (media?.fileType === "video") {
    return "video/mp4";
  }

  if (media?.fileType === "image") {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

// EXTRACTED to services/mediaUrlService. This function was private to this controller and reached
// only from buildProfileResponse — GET /profile/me, the caller's OWN media — which is why every
// other serializer in the codebase shipped raw stored filePaths and rendered broken images. It also
// called getReadableFileUrl, whose /object/public/ URL 400s against the private bucket, so even
// here it only "worked" in the sense that it emitted a string.
//
// The clonePlain wrapper is kept because callers pass Mongoose subdocuments; attachMediaUrl spreads
// its input, and spreading a Mongoose document would copy internal symbols rather than the fields.
async function refreshReadableMediaUrl(media) {
  const mediaObject = clonePlain(media);

  if (!mediaObject?.filePath) {
    return mediaObject;
  }

  return attachMediaUrl(mediaObject);
}

/* Every media subdocument a profile can carry, as { read, write } accessors.
 *
 * The top three were the only ones this function ever signed, which left the PORTFOLIO media dead:
 * ProfilePortfolioManager renders `<a href={media.url}>Open file</a>` for each certification,
 * research paper and achievement, and that url is the stored /object/public/ link — so clicking it
 * returned 400 {"code":"NoSuchBucket"} rather than the file. Same root cause as the company logos,
 * one screen further down. */
function collectProfileMediaSlots(profile) {
  const slots = [
    { read: () => profile.profilePicture, write: (media) => { profile.profilePicture = media; } },
    { read: () => profile.backgroundVideo, write: (media) => { profile.backgroundVideo = media; } },
    { read: () => profile.logo, write: (media) => { profile.logo = media; } },
    { read: () => profile.defaultResume?.media, write: (media) => { profile.defaultResume.media = media; } }
  ];

  for (const key of ["licensesAndCertifications", "researchAndPapers", "achievements"]) {
    (profile[key] || []).forEach((item, index) => {
      slots.push({ read: () => profile[key][index].media, write: (media) => { profile[key][index].media = media; } });
    });
  }

  (profile.projects || []).forEach((project, projectIndex) => {
    for (const key of ["mediaFiles", "documents"]) {
      (project[key] || []).forEach((_item, index) => {
        slots.push({
          read: () => profile.projects[projectIndex][key][index],
          write: (media) => { profile.projects[projectIndex][key][index] = media; }
        });
      });
    }
  });

  return slots.filter((slot) => slot.read());
}

async function buildProfileResponse(user) {
  const profile = clonePlain(user);

  // ONE Supabase call for the whole profile. This used to be three sequential single-signature
  // round-trips (and nothing at all for the portfolio), so a profile with media is now both more
  // complete and fewer requests.
  const slots = collectProfileMediaSlots(profile);
  const resolved = await attachMediaUrls(slots.map((slot) => slot.read()));

  slots.forEach((slot, index) => slot.write(resolved[index]));

  return profile;
}

function canManageProfilePicture(role) {
  return role === "seeker" || role === "organization";
}

function canManageBackgroundVideo(role) {
  return role === "seeker";
}

async function replaceSingleMediaField(user, fieldName, file, folder, uploadOptions) {
  const previousMedia = clonePlain(user[fieldName]);
  const previousPaths = previousMedia?.filePath ? [previousMedia.filePath] : [];
  let nextMedia;
  let nextUploadedItems = [];

  try {
    nextMedia = await uploadMediaDescriptor(file, folder, uploadOptions);
    nextUploadedItems = [nextMedia];
    user[fieldName] = nextMedia;
    await user.save();
  } catch (error) {
    await cleanupUploadedMedia(nextUploadedItems);
    throw error;
  }

  if (previousPaths.length) {
    await safeDeleteStoredFiles(previousPaths).catch(() => null);
  }
}

async function removeSingleMediaField(user, fieldName, notFoundMessage) {
  const previousMedia = clonePlain(user[fieldName]);

  if (!previousMedia) {
    throw new ApiError(404, notFoundMessage);
  }

  if (previousMedia.filePath) {
    await safeDeleteStoredFiles([previousMedia.filePath]);
  }

  user[fieldName] = undefined;
  await user.save();
}

const getMyProfile = asyncHandler(async (req, res) => {
  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  return sendSuccess(res, {
    message: "Profile fetched successfully.",
    profile: await buildProfileResponse(user)
  });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  const updates = pickAllowedUpdates(req.body, getEditableFields(req.user.role));

  if (
    ["seeker", "organization"].includes(req.user.role) &&
    Object.prototype.hasOwnProperty.call(updates, "username")
  ) {
    updates.username = validateUsername(updates.username);
    await assertUsernameAvailable(updates.username, req.user);
  }

  if (req.user.role === "seeker" && Object.prototype.hasOwnProperty.call(updates, "skillGroups")) {
    updates.skillGroups = normalizeSkillGroups(updates.skillGroups);
    updates.skills = flattenSkillGroups(updates.skillGroups);
  }

  if (req.user.role === "seeker" && Object.prototype.hasOwnProperty.call(updates, "customSections")) {
    updates.customSections = normalizeCustomSections(updates.customSections);
  }

  Object.assign(user, updates);

  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) {
      throw new ApiError(409, "This username is already taken.");
    }

    throw error;
  }

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: "Profile updated successfully.",
    profile: await buildProfileResponse(user)
  });
});

const updateCareerObjective = asyncHandler(async (req, res) => {
  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  if (!Object.prototype.hasOwnProperty.call(req.body, "careerObjective")) {
    throw new ApiError(400, "careerObjective is required.");
  }

  user.careerObjective = req.body.careerObjective;
  await user.save();

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: "Career objective updated successfully.",
    profile: user
  });
});

const updateProfilePicture = asyncHandler(async (req, res) => {
  if (!canManageProfilePicture(req.user.role)) {
    throw new ApiError(403, "Profile picture uploads are not available for this role.");
  }

  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  const fieldName = req.user.role === "organization" ? "logo" : "profilePicture";
  const folder = req.user.role === "organization" ? "organization-logos" : "profile-pictures";
  const label = req.user.role === "organization" ? "Company logo" : "Profile picture";

  await replaceSingleMediaField(user, fieldName, req.file, folder, {
    allowedTypes: ["image"],
    label
  });

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: req.user.role === "organization"
      ? "Company logo updated successfully."
      : "Profile picture updated successfully.",
    profilePicture: await refreshReadableMediaUrl(user.profilePicture),
    logo: await refreshReadableMediaUrl(user.logo),
    profile: await buildProfileResponse(user)
  });
});

const removeProfilePicture = asyncHandler(async (req, res) => {
  if (!canManageProfilePicture(req.user.role)) {
    throw new ApiError(403, "Profile picture removal is not available for this role.");
  }

  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  const fieldName = req.user.role === "organization" ? "logo" : "profilePicture";
  const notFoundMessage = req.user.role === "organization" ? "Company logo not found." : "Profile picture not found.";

  await removeSingleMediaField(user, fieldName, notFoundMessage);

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: req.user.role === "organization"
      ? "Company logo removed successfully."
      : "Profile picture removed successfully.",
    profile: await buildProfileResponse(user)
  });
});

const updateBackgroundVideo = asyncHandler(async (req, res) => {
  if (!canManageBackgroundVideo(req.user.role)) {
    throw new ApiError(403, "Background video uploads are not available for this role.");
  }

  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  await replaceSingleMediaField(user, "backgroundVideo", req.file, "background-videos", {
    allowedTypes: ["video"],
    label: "Background video"
  });

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: "Background video updated successfully.",
    backgroundVideo: await refreshReadableMediaUrl(user.backgroundVideo),
    profile: await buildProfileResponse(user)
  });
});

const removeBackgroundVideo = asyncHandler(async (req, res) => {
  if (!canManageBackgroundVideo(req.user.role)) {
    throw new ApiError(403, "Background video removal is not available for this role.");
  }

  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  await removeSingleMediaField(user, "backgroundVideo", "Background video not found.");

  if (req.user.role === "seeker") {
    fireAndForget(() => syncSeekerEmbedding(user._id));
  }

  return sendSuccess(res, {
    message: "Background video removed successfully."
  });
});

const RESUME_STATUS_VALUES = ["Student", "Professional", "Unemployed"];

function importString(value, maxLength = 500) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, maxLength);
}

function importNumber(value) {
  const num = Number(String(value === null || value === undefined ? "" : value).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : undefined;
}

function importDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function importStringList(values = [], maxItems = 60) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => importString(value, 80))
      .filter(Boolean)
  )].slice(0, maxItems);
}

/* This mapper REBUILDS each entry from a fixed set of keys rather than passing the object through,
   which is the right shape for an import boundary - but it means a field missing from the list is
   dropped in silence, with no error anywhere.

   `gpa` was missing, and that is why no education entry in the database had a grade. The whole
   chain worked: the prompt asks for a per-entry grade, the model returns one for EVERY degree, the
   normaliser keeps it as a string with its scale, the review panel shows it, and the schema has a
   `gpa` field waiting. The value was then discarded here, at the last step, by the mapper that
   writes the candidate's approved draft to their profile.

   The visible symptom pointed somewhere else entirely: the most recent degree still rendered a
   grade, because resumeGenerationService falls back to the Number-typed `profile.currentGPA` for
   that one entry, and formatGpa turns 8.2 into "8.2/10" by guessing the scale from the magnitude.
   That made the top entry look correct and the ones below it look like an extraction failure.
   Both were the same missing line.

   Kept as a STRING and bounded at 40 to match the parser's own cleanString(gpa, 40), so "8.68/10",
   "3.68/4", "78.4%" and "First Class with Distinction" all survive with their scale intact. */
function importEducation(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      institution: importString(item.institution, 160),
      degree: importString(item.degree, 120),
      fieldOfStudy: importString(item.fieldOfStudy, 120),
      gpa: importString(item.gpa, 40),
      startDate: importDate(item.startDate),
      endDate: importDate(item.endDate)
    }))
    .filter((item) => item.institution || item.degree || item.fieldOfStudy)
    .slice(0, 10);
}

function importExperience(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      jobTitle: importString(item.jobTitle, 160),
      companyName: importString(item.companyName, 160),
      startDate: importDate(item.startDate),
      endDate: item.isCurrent ? undefined : importDate(item.endDate),
      isCurrent: Boolean(item.isCurrent),
      description: importString(item.description, 3000)
    }))
    .filter((item) => item.jobTitle || item.companyName)
    .slice(0, 15);
}

function importSkillGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      category: importString(group.category, 60),
      skills: importStringList(group.skills, 40)
    }))
    .filter((group) => group.category || group.skills.length)
    .slice(0, 12);
}

function importProjects(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: importString(item.title, 160),
      description: importString(item.description, 3000),
      projectUrl: importString(item.projectUrl, 400),
      repositoryUrl: importString(item.repositoryUrl, 400)
    }))
    .filter((item) => item.title)
    .slice(0, 15);
}

function importTitledList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: importString(item.title, 160),
      description: importString(item.description, 800)
    }))
    .filter((item) => item.title)
    .slice(0, 15);
}

const applyParsedResume = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Resume autofill is only available for job seekers.");
  }

  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  const body = req.body || {};

  // Scalar fields: only overwrite when a non-empty value is provided.
  const setScalar = (field, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      user[field] = value;
    }
  };

  setScalar("firstName", importString(body.firstName, 80));
  setScalar("lastName", importString(body.lastName, 80));
  setScalar("phone", importString(body.phone, 40));
  setScalar("careerObjective", importString(body.careerObjective, 1200));
  setScalar("tagline", importString(body.tagline, 200));
  setScalar("bio", importString(body.bio, 2000));
  setScalar("universityName", importString(body.universityName, 160));
  setScalar("degree", importString(body.degree, 120));
  setScalar("major", importString(body.major, 120));
  setScalar("portfolioUrl", importString(body.portfolioUrl, 400));
  setScalar("linkedinUrl", importString(body.linkedinUrl, 400));
  setScalar("githubUrl", importString(body.githubUrl, 400));

  const graduationYear = importNumber(body.graduationYear);
  if (graduationYear !== undefined) user.graduationYear = graduationYear;

  const currentGPA = importNumber(body.currentGPA);
  if (currentGPA !== undefined) user.currentGPA = currentGPA;

  const currentStatus = importString(body.currentStatus, 40);
  if (RESUME_STATUS_VALUES.includes(currentStatus)) {
    user.currentStatus = currentStatus;
  }

  // Array sections: replace only when a non-empty set is provided, so we never wipe
  // existing data with blanks.
  const skillGroups = importSkillGroups(body.skillGroups);
  if (skillGroups.length) {
    user.skillGroups = skillGroups;
    user.skills = importStringList(skillGroups.flatMap((group) => group.skills));
  } else {
    const skills = importStringList(body.skills);
    if (skills.length) user.skills = skills;
  }

  const preferredRoles = importStringList(body.preferredRoles, 12);
  if (preferredRoles.length) user.preferredRoles = preferredRoles;

  const education = importEducation(body.education);
  if (education.length) user.education = education;

  const experience = importExperience(body.experience);
  if (experience.length) user.experience = experience;

  const projects = importProjects(body.projects);
  if (projects.length) user.projects = projects;

  const certifications = importTitledList(body.certifications);
  if (certifications.length) user.licensesAndCertifications = certifications;

  const achievements = importTitledList(body.achievements);
  if (achievements.length) user.achievements = achievements;

  const customSections = normalizeCustomSections(body.customSections);
  if (customSections.length) user.customSections = customSections;

  await user.save();

  fireAndForget(() => syncSeekerEmbedding(user._id));

  return sendSuccess(res, {
    message: "Imported résumé details saved to your profile.",
    profile: await buildProfileResponse(user)
  });
});

const parseResumeForProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Resume autofill is only available for job seekers.");
  }

  if (!req.file) {
    throw new ApiError(400, "Please upload a resume file (PDF, DOCX, or TXT).");
  }

  const extractedText = await extractResumeText(req.file);

  if (!extractedText || !getResumeTextQuality(extractedText).isReadable) {
    throw new ApiError(
      422,
      "We couldn't read text from this file. If it's a scanned or image-based resume, please upload a text-based PDF/DOCX or fill the profile manually."
    );
  }

  const { draft, warnings, usedFallback, missingSections, modelUsed, providerFailures } =
    await parseResumeToProfile(extractedText);

  return sendSuccess(res, {
    message: usedFallback
      ? "We couldn't read most of this résumé automatically. Review what we did find, then fill in the rest by hand."
      : missingSections.length
        ? "Résumé imported, but some sections came back empty. Review the details, fill the gaps, then save."
        : "Resume parsed. Review the imported details, edit anything, then save.",
    draft,
    warnings,
    usedFallback,
    // Which sections came back empty, so the review panel can name them instead of leaving the
    // candidate to notice the gaps themselves.
    missingSections,
    // Diagnostics only - provider names and failure kinds, never candidate data. They let the UI
    // say WHICH thing is down ("the local model is not running") rather than a generic apology.
    modelUsed,
    providerFailures
  });
});

const streamProfileMedia = asyncHandler(async (req, res) => {
  const user = await findUserByAuth(req.user);

  if (!user) {
    throw new ApiError(404, "Authenticated user was not found.");
  }

  const mediaKeyByParam = {
    "profile-picture": req.user.role === "organization" ? "logo" : "profilePicture",
    "background-video": "backgroundVideo"
  };
  const mediaKey = mediaKeyByParam[req.params.mediaType];

  if (!mediaKey) {
    throw new ApiError(404, "Profile media type was not found.");
  }

  if (mediaKey === "backgroundVideo" && !canManageBackgroundVideo(req.user.role)) {
    throw new ApiError(403, "Background video is not available for this role.");
  }

  const media = user[mediaKey];

  if (!media?.filePath) {
    throw new ApiError(404, "Profile media was not found.");
  }

  const fileBuffer = await downloadFile(media.filePath);
  res.setHeader("Content-Type", getContentTypeFromMedia(media));
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.send(fileBuffer);
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateCareerObjective,
  updateProfilePicture,
  removeProfilePicture,
  updateBackgroundVideo,
  removeBackgroundVideo,
  streamProfileMedia,
  parseResumeForProfile,
  applyParsedResume,
  /* Exported for unit testing. These mappers rebuild each object from a fixed key list, so a field
     the parser produces but a mapper forgets is dropped with no error anywhere - which is exactly
     how education grades went missing from every profile in the database. The test asserts each
     mapper preserves every field its parser counterpart emits. */
  importEducation,
  importExperience,
  importProjects
};
