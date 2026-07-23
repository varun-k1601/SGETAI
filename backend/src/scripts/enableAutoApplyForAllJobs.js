const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Job = require("../models/Job");

async function migrateJobs() {
  try {
    console.log("\n=== ENABLING AUTO-APPLY FOR ALL EXISTING JOBS ===\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Check current state
    const disabledCount = await Job.countDocuments({ autoApplyEnabled: false });
    const enabledCount = await Job.countDocuments({ autoApplyEnabled: true });

    console.log(`Current state:`);
    console.log(`  - Jobs with auto-apply DISABLED: ${disabledCount}`);
    console.log(`  - Jobs with auto-apply ENABLED: ${enabledCount}`);
    console.log();

    if (disabledCount === 0) {
      console.log("✓ All jobs already have auto-apply enabled!");
      await mongoose.connection.close();
      process.exit(0);
    }

    // Enable auto-apply for all jobs that have it disabled
    const result = await Job.updateMany(
      { autoApplyEnabled: false },
      { $set: { autoApplyEnabled: true } }
    );

    console.log(`Migration Results:`);
    console.log(`  - Jobs updated: ${result.modifiedCount}`);
    console.log(`  - Matched jobs: ${result.matchedCount}`);
    console.log();

    // Verify the update
    const finalDisabledCount = await Job.countDocuments({ autoApplyEnabled: false });
    const finalEnabledCount = await Job.countDocuments({ autoApplyEnabled: true });

    console.log(`After migration:`);
    console.log(`  - Jobs with auto-apply DISABLED: ${finalDisabledCount}`);
    console.log(`  - Jobs with auto-apply ENABLED: ${finalEnabledCount}`);
    console.log();

    if (finalDisabledCount === 0) {
      console.log("✓ SUCCESS: All jobs now have auto-apply enabled!");
    } else {
      console.log("⚠️  WARNING: Some jobs still have auto-apply disabled!");
    }

    // List sample of updated jobs
    const sampleJobs = await Job.find({ autoApplyEnabled: true })
      .select("title autoApplyEnabled autoApplyThreshold createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(5);

    console.log("\nSample of updated jobs:");
    sampleJobs.forEach((job, idx) => {
      const updateTime = job.updatedAt ? job.updatedAt.toLocaleString() : job.createdAt.toLocaleString();
      console.log(
        `  ${idx + 1}. "${job.title}" - Threshold: ${job.autoApplyThreshold}`
      );
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrateJobs();
