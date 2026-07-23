import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const MONGO_URI = process.env.MONGO_URI;

async function cleanupDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    // Get admin user
    const adminUser = await db.collection("admins").findOne({ email: ADMIN_EMAIL });

    if (!adminUser) {
      throw new Error(`Admin user with email ${ADMIN_EMAIL} not found!`);
    }

    console.log(`\nFound admin user: ${adminUser.email} (ID: ${adminUser._id})`);
    console.log("\nClearing database...");

    // Clear collections
    const collectionsToClean = [
      "jobseekers",
      "organizations",
      "jobs",
      "applications",
      "posts",
      "connections",
      "chatsessions",
      "careeragentmessages",
      "likes",
      "follows",
      "careeragentmemories",
      "chatmessages",
      "autoapplyruns",
      "comments",
      "verificationrequests",
      "subscriptionpayments",
      "notifications",
      "platformsettings"
    ];

    for (const collectionName of collectionsToClean) {
      const result = await db.collection(collectionName).deleteMany({});
      if (result.deletedCount > 0) {
        console.log(`✓ Cleared ${collectionName}: ${result.deletedCount} documents`);
      }
    }

    console.log("\n✅ Database cleanup complete!");
    console.log(`Admin account preserved: ${ADMIN_EMAIL}`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error during cleanup:", error.message);
    process.exit(1);
  }
}

cleanupDatabase();
