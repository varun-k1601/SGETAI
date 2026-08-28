const { generateLatexResume } = require("./geminiGenerativeService");
const {
  buildResumeFileName,
  getResumeProfileReadiness
} = require("./resumeGenerationService");
const { claimResumeVariant } = require("./resumeVariantRotation");

async function buildTailoredResumeForJob({ seeker, job, source = "ManualApply" }) {
  const readiness = getResumeProfileReadiness(seeker);

  if (!readiness.ready) {
    return {
      ready: false,
      readiness,
      reason: "profile_incomplete"
    };
  }

  // Advances this candidate's rotation, so the next job they apply to gets the next layout. Under
  // auto-apply several of these run in quick succession and two may read the same count — a
  // duplicate layout across two applications, which is cosmetic and not worth serialising for.
  const variant = await claimResumeVariant(seeker);
  const latex = await generateLatexResume(
    typeof seeker.toObject === "function" ? seeker.toObject() : seeker,
    typeof job.toObject === "function" ? job.toObject() : job,
    null,
    // A resume attached to a real, already-submitted application must never show fabricated
    // placeholder content (e.g. an invented "Relevant Experience" entry) for a section the
    // candidate genuinely left empty — omit those sections instead. This differs from the
    // manual AI Generator preview endpoints (proFeaturesController.js), which intentionally show
    // placeholders alongside a "missing sections" warning so the candidate can fill gaps before
    // anything is submitted on their behalf.
    { omitEmptySections: true, variant }
  );

  return {
    ready: true,
    readiness,
    tailoredResume: {
      latex,
      fileName: buildResumeFileName(seeker, job, "tex"),
      generatedAt: new Date(),
      source,
      // Recorded so a resume that renders wrong can be reproduced from the stored application
      // alone, without having to re-derive which layout the candidate's id hashed to.
      templateVariant: variant,
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
