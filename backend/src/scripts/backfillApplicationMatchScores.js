// Backfill for Application.atsScore / resumeMatchScore / autoApplyDecision.
//
// WHY
// ---
// atsScore was written by four unrelated scorers depending on how the application was created:
//   * manual apply      -> scoreResumeAgainstJob (resume TEXT vs job)
//   * auto-apply        -> computeAutoApplyCompositeMatch (pre-filter composite), then overwritten
//                          by computeFinalAutoApplyScore (resume+vector blend)
//   * borderline auto   -> evaluateCandidateMatch (Gemini)
// while the /jobs page shows computeCandidateMatch (profile vs job) — a fifth thing. So the same
// job showed one number on /jobs and a different one on /applied, in BOTH directions, because the
// two were different formulas rather than the same formula at different times.
//
// The code now stores computeCandidateMatch in atsScore, the resume-text score in resumeMatchScore
// (the field the model already reserved for it), and the auto-apply gating composite in
// autoApplyDecision. This script brings existing rows onto the same footing.
//
// WHAT IT DOES, PER APPLICATION
// -----------------------------
//   * atsScore              <- computeCandidateMatch(seeker, job).score, recomputed from the
//                              CURRENT profile and job. Deterministic and offline: no LLM call, no
//                              network, so re-running it is stable.
//   * the OLD atsScore is not discarded, it is moved to where it belonged:
//       source Manual       -> resumeMatchScore  (jobController wrote scoreResumeAgainstJob there)
//       source auto/AutoApply -> autoApplyDecision.gateScore  (that value is what was compared
//                              against the threshold, so it is the audit record)
//     Neither is overwritten if already populated — a row that already carries a real
//     resumeMatchScore keeps it.
//
// HONEST ABOUT WHAT IT CANNOT KNOW
// --------------------------------
//   * The threshold in force at the time was never recorded, so autoApplyDecision.threshold is
//     left UNSET for backfilled rows rather than guessed from today's setting. gateScore is a
//     fact; the bar it cleared is not recoverable.
//   * A backfilled gateSource is "backfilled_legacy_atsscore", never one of the live values — the
//     old field cannot tell us whether the pre-filter, the blend or Gemini produced it.
//   * Rows whose job or seeker no longer exists are SKIPPED, not zeroed.
//   * Requirement (e) of the brief, enforced literally: if the recompute produces 0 where a real
//     score was stored, the row is skipped and reported. A 0 renders as an em dash ("never
//     scored") in the UI, so writing one would destroy information rather than correct it.
//
// Idempotent: re-running recomputes the same atsScore and will not re-move an old value into a
// field that is already populated.
//
// Usage: node src/scripts/backfillApplicationMatchScores.js [--dry-run]
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Application = require("../models/Application");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const { computeCandidateMatch, tagFromScore } = require("../services/matchService");

const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_SOURCES = new Set(["auto", "AutoApply"]);

async function backfillApplicationMatchScores() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name}).`);
  if (DRY_RUN) {
    console.log("DRY RUN - no writes will be performed.");
  }
  console.log("");

  const applications = await Application.find({})
    .select("_id jobId jobSeekerId atsScore atsTag resumeMatchScore resumeMatchTag source autoApplyDecision createdAt")
    .lean();

  console.log(`Found ${applications.length} application(s).\n`);

  if (!applications.length) {
    await mongoose.disconnect();
    return;
  }

  // One pass for the referenced jobs and seekers, keyed for lookup — computeCandidateMatch needs
  // the full documents, not projections, because it reads across skills, experience and education.
  const jobIds = [...new Set(applications.map((a) => String(a.jobId)))];
  const seekerIds = [...new Set(applications.map((a) => String(a.jobSeekerId)))];
  const [jobs, seekers] = await Promise.all([
    Job.find({ _id: { $in: jobIds } }).select("+hiddenRoles").lean(),
    JobSeeker.find({ _id: { $in: seekerIds } }).lean()
  ]);
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const seekerById = new Map(seekers.map((s) => [String(s._id), s]));

  const stats = { updated: 0, unchanged: 0, skippedMissing: 0, skippedZero: 0, movedResume: 0, movedGate: 0 };

  for (const application of applications) {
    const job = jobById.get(String(application.jobId));
    const seeker = seekerById.get(String(application.jobSeekerId));

    if (!job || !seeker) {
      stats.skippedMissing += 1;
      console.log(`  SKIP  ${application._id}  ${!job ? "job" : "seeker"} no longer exists`);
      continue;
    }

    const previous = Number.isFinite(application.atsScore) ? application.atsScore : 0;
    const recomputed = computeCandidateMatch(seeker, job);

    if (recomputed.score === 0 && previous > 0) {
      stats.skippedZero += 1;
      console.log(`  SKIP  ${application._id}  recompute produced 0 but ${previous} is stored — left untouched`);
      continue;
    }

    const update = {
      atsScore: recomputed.score,
      atsTag: recomputed.tag
    };

    // Preserve the old value in the field it actually belonged to, without clobbering real data.
    const isAuto = AUTO_SOURCES.has(application.source);
    if (previous > 0) {
      if (!isAuto && !Number.isFinite(application.resumeMatchScore)) {
        update.resumeMatchScore = previous;
        update.resumeMatchTag = application.atsTag || tagFromScore(previous);
        stats.movedResume += 1;
      } else if (isAuto && !Number.isFinite(application.autoApplyDecision?.gateScore)) {
        update["autoApplyDecision.gateScore"] = previous;
        update["autoApplyDecision.gateTag"] = application.atsTag || tagFromScore(previous);
        update["autoApplyDecision.gateSource"] = "backfilled_legacy_atsscore";
        update["autoApplyDecision.decidedAt"] = application.createdAt || undefined;
        stats.movedGate += 1;
      }
    }

    const changed = update.atsScore !== previous || Object.keys(update).length > 2;
    if (!changed) {
      stats.unchanged += 1;
      continue;
    }

    const delta = update.atsScore - previous;
    console.log(
      `  ${DRY_RUN ? "WOULD" : "SET  "} ${application._id}  ${String(application.source).padEnd(9)} ` +
        `atsScore ${String(previous).padStart(3)} -> ${String(update.atsScore).padStart(3)} (${delta >= 0 ? "+" : ""}${delta})` +
        (update.resumeMatchScore !== undefined ? `  resumeMatchScore <- ${update.resumeMatchScore}` : "") +
        (update["autoApplyDecision.gateScore"] !== undefined ? `  gateScore <- ${update["autoApplyDecision.gateScore"]}` : "")
    );

    if (!DRY_RUN) {
      await Application.updateOne({ _id: application._id }, { $set: update });
    }
    stats.updated += 1;
  }

  console.log("");
  console.log(`${DRY_RUN ? "Would update" : "Updated"}: ${stats.updated}`);
  console.log(`  old atsScore moved to resumeMatchScore : ${stats.movedResume}`);
  console.log(`  old atsScore moved to gateScore        : ${stats.movedGate}`);
  console.log(`Already correct: ${stats.unchanged}`);
  console.log(`Skipped (job/seeker deleted): ${stats.skippedMissing}`);
  console.log(`Skipped (recompute would zero a real score): ${stats.skippedZero}`);

  await mongoose.disconnect();
}

backfillApplicationMatchScores()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
