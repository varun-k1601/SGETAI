const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Job = require("../models/Job");
const Organization = require("../models/Organization");
const AutoApplyRun = require("../models/AutoApplyRun");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");

async function testAutoApplyFix() {
  try {
    console.log("\n=== TESTING AUTO-APPLY FIX ===\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // 1. Create a test job
    console.log("STEP 1: Creating test job...");
    const org = await Organization.findOne().select("_id companyName");
    if (!org) {
      throw new Error("No organization found in database");
    }

    const testJob = await Job.create({
      title: "AUTO-APPLY TEST JOB - " + new Date().toISOString().slice(0, 19),
      description: "This is a test job to verify auto-apply functionality",
      organizationId: org._id,
      location: "Remote",
      industry: "Technology",
      type: "Full-time",
      salary: { min: 80000, max: 120000, currency: "USD" },
      skills: ["JavaScript", "Node.js", "MongoDB"],
      skillsRequired: ["JavaScript", "Node.js"],
      requirements: ["3+ years experience", "REST API design"],
      autoApplyThreshold: 57
      // autoApplyEnabled defaults to true now!
    });

    console.log(`✓ Test job created: "${testJob.title}"`);
    console.log(`  Job ID: ${testJob._id}`);
    console.log(`  Auto-Apply Enabled: ${testJob.autoApplyEnabled}`);
    console.log(`  Threshold: ${testJob.autoApplyThreshold}\n`);

    // 2. Manually trigger auto-apply (simulating what fireAndForget does)
    console.log("STEP 2: Running auto-apply for test job...");
    console.log("This simulates the fireAndForget callback from job creation\n");

    const result = await runAutoApplyForJob(testJob._id, { source: "test_job_created" });

    console.log(`✓ Auto-apply execution completed!`);
    console.log(`  Applications Created: ${result.applicationsCreated}`);
    console.log(`  Candidates Evaluated: ${result.candidatesEvaluated}`);
    console.log(`  Ready: ${result.ready}\n`);

    if (result.skippedReasons && Object.keys(result.skippedReasons).length > 0) {
      console.log("  Skipped Reasons:");
      for (const [reason, count] of Object.entries(result.skippedReasons)) {
        console.log(`    - ${reason}: ${count}`);
      }
      console.log();
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log("  Warnings:");
      result.warnings.forEach((w) => console.log(`    - ${w}`));
      console.log();
    }

    // 3. Verify AutoApplyRun log
    console.log("STEP 3: Verifying AutoApplyRun log...");
    const autoApplyLog = await AutoApplyRun.findOne({
      jobId: testJob._id
    });

    if (autoApplyLog) {
      console.log(`✓ Auto-apply run log found!`);
      console.log(`  Job ID: ${autoApplyLog.jobId}`);
      console.log(`  Source: ${autoApplyLog.source}`);
      console.log(`  Candidates Evaluated: ${autoApplyLog.candidatesEvaluated}`);
      console.log(`  Applications Created: ${autoApplyLog.applicationsCreated}`);
      console.log(`  Ready: ${autoApplyLog.ready}`);
      console.log(`  Applied Seeker IDs: ${autoApplyLog.appliedSeekerIds.length}\n`);
    } else {
      console.log(`✗ No auto-apply run log found!\n`);
    }

    // 4. Summary
    console.log("=== TEST SUMMARY ===");
    if (testJob.autoApplyEnabled && result.ready) {
      console.log("✓ Auto-apply feature is NOW WORKING!");
      console.log(`✓ Applications created: ${result.applicationsCreated}`);
      if (result.applicationsCreated > 0) {
        console.log("✓ SUCCESS: Feature is fully functional!");
      } else {
        console.log("⚠️  No applications created - check:");
        console.log("   - Are there Pro users with auto-apply enabled?");
        console.log("   - Do their ATS scores meet the threshold?");
      }
    } else {
      console.log("✗ Auto-apply not working as expected");
      console.log(`  autoApplyEnabled: ${testJob.autoApplyEnabled}`);
      console.log(`  ready: ${result.ready}`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

testAutoApplyFix();
