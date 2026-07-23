import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function clearJobThresholds() {
  try {
    console.log("Connecting to MongoDB...\n");
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;

    // Clear thresholds for all jobs
    const result = await db.collection("jobs").updateMany(
      {},
      { $unset: { autoApplyThreshold: "" } }
    );

    console.log("✅ Job thresholds cleared!\n");
    console.log(`   Modified jobs: ${result.modifiedCount}`);
    console.log(`   Matched jobs: ${result.matchedCount}\n`);
    console.log("📋 All jobs will now use the global auto-apply policy threshold.\n");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

clearJobThresholds();
