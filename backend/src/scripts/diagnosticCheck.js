const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const JobSeeker = require("../models/JobSeeker");
const PlatformSetting = require("../models/PlatformSetting");
const AutoApplyRun = require("../models/AutoApplyRun");
const Job = require("../models/Job");

async function runDiagnostics() {
  try {
    console.log("\n=== DIAGNOSTIC CHECK FOR AUTO-APPLY FEATURE ===\n");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // 1. Check Pro users with auto-apply enabled
    console.log("1️⃣  CHECKING PRO USERS WITH AUTO-APPLY ENABLED:");
    const proUsersCount = await JobSeeker.countDocuments({
      isPro: true,
      "autoApplyPreferences.enabled": true
    });
    console.log(`   Count: ${proUsersCount}`);

    if (proUsersCount > 0) {
      const sampleUsers = await JobSeeker.find({
        isPro: true,
        "autoApplyPreferences.enabled": true
      })
        .select("firstName lastName email isPro autoApplyPreferences")
        .limit(3);
      console.log(`   Sample users:`);
      sampleUsers.forEach((user, idx) => {
        console.log(
          `   ${idx + 1}. ${user.firstName} ${user.lastName} (${user.email}) - Threshold: ${user.autoApplyPreferences?.matchThreshold}, Daily Max: ${user.autoApplyPreferences?.maxDailyApplications}`
        );
      });
    } else {
      console.log("   ⚠️  WARNING: No Pro users with auto-apply enabled!");
    }
    console.log();

    // 2. Check platform auto-apply policy
    console.log("2️⃣  CHECKING PLATFORM AUTO-APPLY POLICY:");
    const platformSettings = await PlatformSetting.findOne({
      key: "platform_policy"
    });
    if (platformSettings) {
      console.log(`   Platform Policy Found:`);
      console.log(`   - Enabled: ${platformSettings.proAutoApplyPolicy?.enabled}`);
      console.log(
        `   - Match Threshold: ${platformSettings.proAutoApplyPolicy?.matchThreshold}`
      );
      console.log(
        `   - Max Daily Applications: ${platformSettings.proAutoApplyPolicy?.maxDailyApplications}`
      );
      if (platformSettings.proAutoApplyPolicy?.enabled === false) {
        console.log(
          "   ⚠️  WARNING: Platform auto-apply is DISABLED!"
        );
      }
    } else {
      console.log("   ⚠️  WARNING: Platform settings not found!");
    }
    console.log();

    // 3. Check recent AutoApplyRun logs
    console.log("3️⃣  CHECKING RECENT AUTO-APPLY RUN LOGS:");
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentRuns = await AutoApplyRun.find({
      createdAt: { $gte: oneHourAgo }
    })
      .sort({ createdAt: -1 })
      .limit(10);

    if (recentRuns.length === 0) {
      console.log(
        `   ⚠️  No auto-apply runs in the last hour!`
      );
    } else {
      console.log(`   Found ${recentRuns.length} runs:`);
      recentRuns.forEach((run, idx) => {
        console.log(`\n   ${idx + 1}. Job ID: ${run.jobId}`);
        console.log(`      Source: ${run.source}`);
        console.log(`      Time: ${run.createdAt.toLocaleString()}`);
        console.log(
          `      Candidates Evaluated: ${run.candidatesEvaluated}`
        );
        console.log(
          `      Applications Created: ${run.applicationsCreated}`
        );
        console.log(`      Ready: ${run.ready}`);
        if (Object.keys(run.skippedReasons).length > 0) {
          console.log(`      Skipped Reasons:`, run.skippedReasons);
        }
        if (run.warnings.length > 0) {
          console.log(`      Warnings:`, run.warnings);
        }
        if (run.errors.length > 0) {
          console.log(`      Errors:`, run.errors);
        }
      });
    }
    console.log();

    // 4. Check jobs with auto-apply enabled
    console.log("4️⃣  CHECKING JOBS WITH AUTO-APPLY ENABLED:");
    const autoApplyJobsCount = await Job.countDocuments({
      autoApplyEnabled: true
    });
    console.log(`   Count: ${autoApplyJobsCount}`);

    if (autoApplyJobsCount > 0) {
      const recentJobs = await Job.find({ autoApplyEnabled: true })
        .select("title organizationId autoApplyEnabled autoApplyThreshold embedding createdAt")
        .sort({ createdAt: -1 })
        .limit(5);
      console.log(`   Recent jobs with auto-apply:`);
      recentJobs.forEach((job, idx) => {
        const hasEmbedding = Array.isArray(job.embedding) && job.embedding.length > 0;
        console.log(
          `   ${idx + 1}. "${job.title}" (Threshold: ${job.autoApplyThreshold}) - Embedding: ${hasEmbedding ? "✓" : "✗"} - Created: ${job.createdAt.toLocaleString()}`
        );
      });
    } else {
      console.log("   ⚠️  No jobs with auto-apply enabled!");
    }
    console.log();

    // 5. Additional diagnostics
    console.log("5️⃣  ADDITIONAL DIAGNOSTICS:");
    const totalJobs = await Job.countDocuments();
    const totalSeekers = await JobSeeker.countDocuments();
    const totalProSeekers = await JobSeeker.countDocuments({ isPro: true });

    console.log(`   Total Jobs: ${totalJobs}`);
    console.log(`   Total Job Seekers: ${totalSeekers}`);
    console.log(`   Total Pro Seekers: ${totalProSeekers}`);
    console.log();

    console.log("=== DIAGNOSTIC SUMMARY ===");
    console.log(
      proUsersCount > 0
        ? `✓ Pro users with auto-apply: ${proUsersCount}`
        : `✗ No Pro users with auto-apply`
    );
    console.log(
      platformSettings?.proAutoApplyPolicy?.enabled !== false
        ? `✓ Platform auto-apply is enabled`
        : `✗ Platform auto-apply is disabled`
    );
    console.log(
      recentRuns.length > 0
        ? `✓ Auto-apply runs detected: ${recentRuns.length}`
        : `✗ No auto-apply runs in last hour`
    );
    console.log(
      autoApplyJobsCount > 0
        ? `✓ Jobs with auto-apply: ${autoApplyJobsCount}`
        : `✗ No jobs with auto-apply`
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Diagnostic check failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

runDiagnostics();
