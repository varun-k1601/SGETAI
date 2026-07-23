const { generateLatexResume } = require("./geminiGenerativeService");
const fs = require("fs");
const path = require("path");
const {
  buildResumeFileName,
  getResumeProfileReadiness
} = require("./resumeGenerationService");

const resumeTemplate = fs.readFileSync(
  path.join(__dirname, "..", "utils", "resume.template.txt"),
  "utf8"
);

async function buildTailoredResumeForJob({ seeker, job, source = "ManualApply" }) {
  const readiness = getResumeProfileReadiness(seeker);

  if (!readiness.ready) {
    return {
      ready: false,
      readiness,
      reason: "profile_incomplete"
    };
  }

  const latex = await generateLatexResume(
    typeof seeker.toObject === "function" ? seeker.toObject() : seeker,
    typeof job.toObject === "function" ? job.toObject() : job,
    resumeTemplate,
    // A resume attached to a real, already-submitted application must never show fabricated
    // placeholder content (e.g. an invented "Relevant Experience" entry) for a section the
    // candidate genuinely left empty — omit those sections instead. This differs from the
    // manual AI Generator preview endpoints (proFeaturesController.js), which intentionally show
    // placeholders alongside a "missing sections" warning so the candidate can fill gaps before
    // anything is submitted on their behalf.
    { omitEmptySections: true }
  );

  return {
    ready: true,
    readiness,
    tailoredResume: {
      latex,
      fileName: buildResumeFileName(seeker, job, "tex"),
      generatedAt: new Date(),
      source,
      profileSectionsUsed: readiness.profileSectionsUsed
    }
  };
}

async function attachTailoredResumeToApplication({ application, seeker, job, source }) {
  const result = await buildTailoredResumeForJob({ seeker, job, source });

  if (!result.ready) {
    return result;
  }

  application.tailoredResume = result.tailoredResume;
  await application.save();

  return result;
}

module.exports = {
  buildTailoredResumeForJob,
  attachTailoredResumeToApplication
};
