const JobSeeker = require("../models/JobSeeker");
const GeneratedArtifact = require("../models/GeneratedArtifact");
const { fireAndForget } = require("./aiSyncService");
const {
  RESUME_VARIANTS,
  normalizeResumeVariant,
  resolveResumeVariant
} = require("./resumeGenerationService");

/* ===============================================================================================
   WHICH LAYOUT DOES THIS CANDIDATE GET NEXT?
   ===============================================================================================
   resumeGenerationService answers "given a starting offset and a rotation count, which of the six".
   This module answers "what is the rotation count", which is the only part that needs the
   database — keeping the formatter itself pure, and testable without a Mongo connection.

   ------------------------------------------------------------------------------------------------
   WHY A COUNTER FIELD AND NOT A LIVE GeneratedArtifact COUNT
   ------------------------------------------------------------------------------------------------
   GeneratedArtifact was the obvious source — `{ userId, type: "resume" }`, already indexed by
   `{ userId: 1, createdAt: -1 }` — but it does NOT observe every generation. Only ONE of the three
   resume endpoints writes an artifact:

     POST /pro/agent/tailor-resume-pdf        writes a GeneratedArtifact   (AI Generator page)
     POST /pro/jobs/:jobId/generate-resume    writes NOTHING               (Pro Tools page)
     POST /pro/jobs/:jobId/generate-resume/pdf  writes NOTHING             (Pro Tools page)

   Counting artifacts alone would leave two of the three paths returning the same layout forever,
   which is the precise symptom this change exists to remove — and it would look like the change
   never landed. So the rotation count lives on JobSeeker.resumeGenerationCount, advanced by every
   generation path.

   GeneratedArtifact is still the source of truth for candidates who have no counter yet: the field
   has NO schema default, so an existing candidate reads `undefined` and seeds from their real
   artifact history rather than restarting the cycle from their offset.
   =============================================================================================== */

function isUsableCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/* Never throws and never returns NaN. A failed count degrades to 0, which means "start of this
   candidate's cycle" — their own hash offset, NOT variant A. That distinction matters: a database
   hiccup during a busy minute must not quietly funnel every candidate onto the same template. */
async function readRotationCount(seeker) {
  if (isUsableCount(seeker?.resumeGenerationCount)) {
    return seeker.resumeGenerationCount;
  }

  const seekerId = seeker?._id;

  if (!seekerId) {
    return 0;
  }

  try {
    const priorArtifacts = await GeneratedArtifact.countDocuments({ userId: seekerId, type: "resume" });
    return isUsableCount(priorArtifacts) ? priorArtifacts : 0;
  } catch (error) {
    console.error("Resume rotation count unavailable; starting this candidate's cycle:", error.message);
    return 0;
  }
}

/* `$set` to the value we just consumed, not `$inc`.
 *
 * `$inc` on a candidate whose counter is still unset writes 1, discarding the artifact-history
 * seed we just read — so a candidate with five prior resumes would jump from offset+5 back to
 * offset+1 on their next generation. Setting the used value keeps the sequence monotonic across
 * the seed boundary.
 *
 * Deliberately NOT locked or made atomic. Auto-apply can generate several resumes for one
 * candidate in quick succession, and two of them reading the same count will land on the same
 * layout. That is a duplicate, not a defect: the candidate still gets a valid, correctly rendered
 * resume, and the cycle resumes on the next generation. Serialising resume generation to avoid a
 * cosmetic repeat would be a far worse trade.
 */
function recordResumeGeneration(seekerId, usedRotation) {
  if (!seekerId || !isUsableCount(usedRotation)) {
    return;
  }

  fireAndForget(
    () => JobSeeker.updateOne({ _id: seekerId }, { $set: { resumeGenerationCount: usedRotation + 1 } }),
    "resumeVariantRotation"
  );
}

/**
 * The layout for the resume about to be generated, advancing the candidate's rotation as a side
 * effect. Call this ONCE per generated document.
 *
 * A saved `resumeTemplateVariant` preference wins outright and does not advance the counter: a
 * candidate who pinned a layout asked for that layout every time, not for a rotation that happens
 * to be overridden.
 */
async function claimResumeVariant(seeker) {
  const pinned = normalizeResumeVariant(seeker?.resumeTemplateVariant);

  if (pinned) {
    return pinned;
  }

  const rotation = await readRotationCount(seeker);
  const variant = resolveResumeVariant({ variantSeed: seeker?._id, rotation });

  recordResumeGeneration(seeker?._id, rotation);

  return variant;
}

module.exports = {
  RESUME_VARIANTS,
  claimResumeVariant,
  readRotationCount,
  recordResumeGeneration
};
