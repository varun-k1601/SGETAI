const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Job = require("../models/Job");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");

async function retryAutoApplyForExistingJobs() {
  try {
    console.log("\n=== RETRYING AUTO-APPLY FOR EXISTING JOBS ===\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Get all jobs with auto-apply enabled
    const jobs = await Job.find({ autoApplyEnabled: true })
      .sort({ createdAt: -1 })
      .select("_id title autoApplyEnabled createdAt");

    console.log(`Found ${jobs.length} jobs with auto-apply enabled\n`);

    let successCount = 0;
    let failureCount = 0;
    let totalApplicationsCreated = 0;

    for (const job of jobs) {
      try {
        console.log(`Processing: "${job.title}" (ID: ${job._id})`);

        const result = await runAutoApplyForJob(job._id, { source: "retry_existing_jobs" });

        console.log(`  ✓ Applications created: ${result.applicationsCreated}`);
        console.log(`  ✓ Candidates evaluated: ${result.candidatesEvaluated}`);

        totalApplicationsCreated += result.applicationsCreated;
        successCount++;
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
        failureCount++;
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs processed: ${jobs.length}`);
    console.log(`Successful retries: ${successCount}`);
    console.log(`Failed retries: ${failureCount}`);
    console.log(`Total applications created: ${totalApplicationsCreated}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Retry failed:", error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

retryAutoApplyForExistingJobs();
