require("../config/env");

const mongoose = require("mongoose");
const { connectToDatabase } = require("../config/db");
const Application = require("../models/Application");
const Job = require("../models/Job");
const VerificationRequest = require("../models/VerificationRequest");
const AutoApplyRun = require("../models/AutoApplyRun");
const Notification = require("../models/Notification");
const { safeDeleteStoredFiles } = require("../utils/mediaStorage");

const JOB_RELATED_NOTIFICATION_TYPES = [
  "job_application",
  "application_status",
  "application_withdrawn",
  "auto_apply_success"
];

async function cleanupJobsAndApplications() {
  try {
    console.log("Connecting to MongoDB...");
    await connectToDatabase();
    console.log("Connected to MongoDB");

    console.log("\nCollecting attached resume files from applications...");
    const applications = await Application.find({}).select("attachedResume.media.filePath").lean();
    const resumeFilePaths = applications
      .map((application) => application.attachedResume?.media?.filePath)
      .filter(Boolean);

    console.log(`Found ${resumeFilePaths.length} attached resume file(s) to remove from storage.`);

    let filesDeleted = 0;
    let filesFailed = 0;

    if (resumeFilePaths.length) {
      try {
        const deletedPaths = await safeDeleteStoredFiles(resumeFilePaths);
        filesDeleted = deletedPaths.length;
      } catch (error) {
        // safeDeleteStoredFiles deletes in one batch call; if the batch itself fails,
        // fall back to per-file deletion so one bad path doesn't block every other file.
        console.warn(`Batch storage deletion failed (${error.message}), retrying file-by-file...`);

        for (const filePath of resumeFilePaths) {
          try {
            await safeDeleteStoredFiles([filePath]);
            filesDeleted += 1;
          } catch (fileError) {
            filesFailed += 1;
            console.warn(`  ✗ Failed to delete storage file "${filePath}": ${fileError.message}`);
          }
        }
      }
    }

    console.log(`✓ Storage cleanup: ${filesDeleted} file(s) deleted, ${filesFailed} failed.`);

    console.log("\nClearing job/application collections...");

    const deletedCounts = {};

    deletedCounts.applications = (await Application.deleteMany({})).deletedCount;
    console.log(`✓ Cleared applications: ${deletedCounts.applications} documents`);

    deletedCounts.jobs = (await Job.deleteMany({})).deletedCount;
    console.log(`✓ Cleared jobs: ${deletedCounts.jobs} documents`);

    deletedCounts.verificationrequests = (await VerificationRequest.deleteMany({})).deletedCount;
    console.log(`✓ Cleared verificationrequests: ${deletedCounts.verificationrequests} documents`);

    deletedCounts.autoapplyruns = (await AutoApplyRun.deleteMany({})).deletedCount;
    console.log(`✓ Cleared autoapplyruns: ${deletedCounts.autoapplyruns} documents`);

    deletedCounts.notifications = (
      await Notification.deleteMany({ type: { $in: JOB_RELATED_NOTIFICATION_TYPES } })
    ).deletedCount;
    console.log(`✓ Cleared notifications (job/application-related): ${deletedCounts.notifications} documents`);

    console.log("\n✅ Job/application cleanup complete!");
    console.log("Summary:");
    console.log(`  applications deleted:          ${deletedCounts.applications}`);
    console.log(`  jobs deleted:                  ${deletedCounts.jobs}`);
    console.log(`  verificationrequests deleted:  ${deletedCounts.verificationrequests}`);
    console.log(`  autoapplyruns deleted:         ${deletedCounts.autoapplyruns}`);
    console.log(`  notifications deleted:         ${deletedCounts.notifications}`);
    console.log(`  storage files deleted:         ${filesDeleted}`);
    console.log(`  storage files failed:          ${filesFailed}`);
    console.log("JobSeeker and Organization accounts were not touched.");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error during cleanup:", error.message);
    process.exit(1);
  }
}

cleanupJobsAndApplications();
