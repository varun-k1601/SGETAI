import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import Job from "../models/Job.js";

async function checkThreshold() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB\n");

    const jobs = await Job.find({})
      .populate("organizationId", "companyName")
      .sort({ createdAt: -1 })
      .limit(5);

    console.log("Recent jobs and their thresholds:\n");
    jobs.forEach((job, index) => {
      console.log(`${index + 1}. ${job.title}`);
      console.log(`   Company: ${job.organizationId?.companyName}`);
      console.log(`   Auto-apply enabled: ${job.autoApplyEnabled}`);
      console.log(`   Threshold: ${job.autoApplyThreshold}`);
      console.log(`   Status: ${job.status}`);
      console.log();
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkThreshold();
