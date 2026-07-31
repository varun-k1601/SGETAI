const { calculateEducationYears } = require("./educationMetrics");

function joinText(parts) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
}

function yearLabel(value) {
  if (!value) {
    return "";
  }

  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : String(value);
}

function buildJobText(job) {
  if (!job) {
    return "";
  }

  return joinText([
    `Title: ${job.title || ""}`,
    `Description: ${job.description || ""}`,
    `Location: ${job.location || ""}`,
    `Industry: ${job.industry || ""}`,
    `Type: ${job.type || ""}`,
    `Requirements: ${(job.requirements || []).join(", ")}`,
    `Skills: ${(job.skills || []).join(", ")}`,
    `Skills Required: ${(job.skillsRequired || []).join(", ")}`,
    (job.customFields || []).map((field) => `${field.label}: ${field.value || ""}`).join("\n")
  ]);
}

function buildSeekerText(seeker) {
  if (!seeker) {
    return "";
  }

  const skillGroups = (seeker.skillGroups || [])
    .map((group) => `${group.category || "Skills"}: ${(group.skills || []).join(", ")}`)
    .join(" | ");
  const educationYears = calculateEducationYears(seeker.education || []);

  return joinText([
    `Name: ${seeker.firstName || ""} ${seeker.lastName || ""}`,
    `Tagline: ${seeker.tagline || ""}`,
    `Bio: ${seeker.bio || ""}`,
    `Career Objective: ${seeker.careerObjective || ""}`,
    `Current Status: ${seeker.currentStatus || ""}`,
    `Skill Groups: ${skillGroups}`,
    `Skills: ${(seeker.skills || []).join(", ")}`,
    `Preferred Roles: ${(seeker.preferredRoles || []).join(", ")}`,
    `Education Years: ${educationYears || "Not calculated"}`,
    `Education History: ${(seeker.education || [])
      .map((item) => `${item.degree || ""} ${item.fieldOfStudy || ""} at ${item.institution || ""}: ${yearLabel(item.startDate)} to ${yearLabel(item.endDate) || "Present"}`)
      .join(" | ")}`,
    `Experience: ${(seeker.experience || [])
      .map((item) => `${item.jobTitle || ""} at ${item.companyName || ""}: ${item.description || ""}`)
      .join(" | ")}`,
    `Projects: ${(seeker.projects || [])
      .map((item) => `${item.title || ""}: ${item.description || ""}`)
      .join(" | ")}`
  ]);
}

function buildProfileSummary(user, role) {
  if (role === "seeker") {
    return buildSeekerText(user);
  }

  if (role === "organization") {
    return joinText([
      `Company: ${user.companyName || ""}`,
      `Industry: ${user.industry || ""}`,
      `Description: ${user.description || ""}`,
      `Website: ${user.websiteUrl || ""}`,
      `Headquarters: ${user.headquartersLocation || ""}`
    ]);
  }

  return "";
}

module.exports = {
  buildJobText,
  buildSeekerText,
  buildProfileSummary
};
