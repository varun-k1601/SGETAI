const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Job = require("../models/Job");

async function checkJobs() {
  try {
    console.log("\n=== DETAILED JOB INSPECTION ===\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Check all jobs
    const allJobs = await Job.find({})
      .select("title autoApplyEnabled autoApplyThreshold autoApplyUseAIScoring autoApplyDailyCap createdAt organizationId")
      .sort({ createdAt: -1 })
      .limit(15);

    console.log(`Found ${allJobs.length} jobs:\n`);

    allJobs.forEach((job, idx) => {
      console.log(`${idx + 1}. "${job.title}"`);
      console.log(`   Created: ${job.createdAt.toLocaleString()}`);
      console.log(`   Auto-Apply Enabled: ${job.autoApplyEnabled ?? "UNDEFINED"}`);
      console.log(`   Auto-Apply Threshold: ${job.autoApplyThreshold ?? "UNDEFINED"}`);
      console.log(`   Use AI Scoring: ${job.autoApplyUseAIScoring ?? "UNDEFINED"}`);
      console.log(`   Daily Cap: ${job.autoApplyDailyCap ?? "UNDEFINED"}`);
      console.log();
    });

    // Check Job schema defaults
    console.log("\n=== JOB SCHEMA INFORMATION ===");
    const jobSchema = Job.schema;
    console.log("Auto-Apply related fields in schema:");
    console.log(`- autoApplyEnabled: `, jobSchema.paths.autoApplyEnabled);
    console.log(`- autoApplyThreshold: `, jobSchema.paths.autoApplyThreshold);
    console.log(`- autoApplyUseAIScoring: `, jobSchema.paths.autoApplyUseAIScoring);
    console.log(`- autoApplyDailyCap: `, jobSchema.paths.autoApplyDailyCap);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Check failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkJobs();
