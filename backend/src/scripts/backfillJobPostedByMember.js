// Backfill for Job.postedByMemberId.
//
// Jobs created through the legacy shared organization login were saved with no attribution
// (jobController.js sets `postedByMemberId: req.user.memberId || undefined`, and a legacy JWT
// carries no memberId), so the "Posted by {name}" pill never renders for them.
//
// Before team accounts existed there was exactly one shared login per company, so the Owner
// member IS genuinely who posted those jobs. This script assigns them on that basis — but only
// where it is a FACT, never a guess:
//
//   * attributed  - the organization has an Owner member, and no non-Owner member existed yet
//                   when the job was created. The Owner was the only account that could have
//                   posted it.
//   * left unset  - the organization has no Owner member at all, OR another member already
//                   existed when the job was created (so any of them could have posted it).
//                   The UI already renders nothing when postedBy is absent, which is the
//                   correct outcome for an unknowable author.
//
// Idempotent: only ever touches jobs whose postedByMemberId is currently unset.
//
// Usage: node src/scripts/backfillJobPostedByMember.js [--dry-run]
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Job = require("../models/Job");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");

const DRY_RUN = process.argv.includes("--dry-run");

async function backfillJobPostedByMember() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name}).`);
  if (DRY_RUN) {
    console.log("DRY RUN - no writes will be performed.");
  }
  console.log("");

  const jobs = await Job.find({
    $or: [{ postedByMemberId: { $exists: false } }, { postedByMemberId: null }]
  }).select("_id title organizationId createdAt");

  console.log(`Found ${jobs.length} job(s) with no attribution.\n`);

  if (!jobs.length) {
    await mongoose.disconnect();
    return;
  }

  const organizationIds = [...new Set(jobs.map((job) => String(job.organizationId)))];
  const members = await OrganizationMember.find({
    organizationId: { $in: organizationIds }
  }).select("_id organizationId role status createdAt");
  const organizations = await Organization.find({
    _id: { $in: organizationIds }
  }).select("_id companyName");

  const organizationNameById = new Map(organizations.map((o) => [String(o._id), o.companyName]));
  const membersByOrganization = new Map();
  members.forEach((member) => {
    const key = String(member.organizationId);
    if (!membersByOrganization.has(key)) {
      membersByOrganization.set(key, []);
    }
    membersByOrganization.get(key).push(member);
  });

  let attributed = 0;
  let skippedNoOwner = 0;
  let skippedAmbiguous = 0;

  for (const job of jobs) {
    const key = String(job.organizationId);
    const label = `${organizationNameById.get(key) || key} / "${job.title}"`;
    const orgMembers = membersByOrganization.get(key) || [];
    const owner = orgMembers.find((member) => member.role === "Owner");

    if (!owner) {
      skippedNoOwner += 1;
      console.log(`  - LEFT UNSET  ${label} - organization has no Owner member`);
      continue;
    }

    // Any non-Owner member that already existed when this job was posted could have posted it.
    const priorOtherMember = orgMembers.find(
      (member) =>
        String(member._id) !== String(owner._id) &&
        member.createdAt &&
        job.createdAt &&
        member.createdAt <= job.createdAt
    );

    if (priorOtherMember) {
      skippedAmbiguous += 1;
      console.log(`  - LEFT UNSET  ${label} - another member already existed when it was posted`);
      continue;
    }

    if (!DRY_RUN) {
      await Job.updateOne({ _id: job._id }, { $set: { postedByMemberId: owner._id } });
    }
    attributed += 1;
    console.log(`  + ATTRIBUTED  ${label} -> Owner ${owner._id}`);
  }

  console.log("\nBackfill complete.");
  console.log(`  Jobs attributed to their Owner: ${attributed}`);
  console.log(`  Left unset (no Owner member): ${skippedNoOwner}`);
  console.log(`  Left unset (ambiguous - multiple possible posters): ${skippedAmbiguous}`);

  await mongoose.disconnect();
}

backfillJobPostedByMember().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
