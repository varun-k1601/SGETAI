// One-time migration: give every seeker who already opted into recruiter introductions the two
// channel consents that now gate the feature, so their behavior is unchanged by the split.
//
// WHY THIS IS REQUIRED, not optional. Before this change, autoApplyPreferences
// .autoIntroduceToRecruiters alone caused a connection AND an AI-drafted first message.
// recruiterIntroductionWorker now additionally requires autoConnectEnabled (for the connection)
// and autoDMEnabled (for the message). Both of those default to false, and Mongoose has already
// materialized them as false on existing documents — so there is no way to distinguish "never
// set" from "deliberately off" at read time. Without this backfill, everyone currently opted in
// would silently stop receiving introductions the moment the new worker ships.
//
// Only touches seekers with autoIntroduceToRecruiters === true. Seekers who never opted in keep
// both flags false, because turning on outreach channels for someone who never asked for the
// feature is exactly the thing this codebase refuses to do elsewhere.
//
// Idempotent — safe to run more than once; the filter excludes documents already backfilled.
//
// Usage: node src/scripts/backfillIntroductionChannels.js
//        npm run migrate:introduction-channels
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const JobSeeker = require("../models/JobSeeker");

async function backfillIntroductionChannels() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const optedInFilter = { "autoApplyPreferences.autoIntroduceToRecruiters": true };
  const totalOptedIn = await JobSeeker.countDocuments(optedInFilter);

  // Anyone opted in who is missing EITHER channel. Using $ne: true rather than false so documents
  // predating the fields entirely (unset, not false) are caught too.
  const needsBackfillFilter = {
    ...optedInFilter,
    $or: [
      { "autoApplyPreferences.autoConnectEnabled": { $ne: true } },
      { "autoApplyPreferences.autoDMEnabled": { $ne: true } }
    ]
  };

  const pending = await JobSeeker.find(needsBackfillFilter).select(
    "email autoApplyPreferences.autoConnectEnabled autoApplyPreferences.autoDMEnabled"
  );

  if (!pending.length) {
    console.log(`Nothing to do — all ${totalOptedIn} opted-in seeker(s) already have both channels.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${pending.length} of ${totalOptedIn} opted-in seeker(s) to backfill:\n`);

  for (const seeker of pending) {
    const missing = [
      seeker.autoApplyPreferences?.autoConnectEnabled ? null : "autoConnectEnabled",
      seeker.autoApplyPreferences?.autoDMEnabled ? null : "autoDMEnabled"
    ].filter(Boolean);

    console.log(`  ${seeker.email} — setting ${missing.join(", ")}`);
  }

  const result = await JobSeeker.updateMany(needsBackfillFilter, {
    $set: {
      "autoApplyPreferences.autoConnectEnabled": true,
      "autoApplyPreferences.autoDMEnabled": true
    }
  });

  console.log("\nBackfill complete.");
  console.log(`  Seekers opted into introductions: ${totalOptedIn}`);
  console.log(`  Seekers updated: ${result.modifiedCount}`);
  console.log(`  Already correct: ${totalOptedIn - pending.length}`);

  await mongoose.disconnect();
}

backfillIntroductionChannels().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
