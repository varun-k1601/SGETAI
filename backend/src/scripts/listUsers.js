import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function listUsers() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;

    // Get all users
    const users = await db.collection("users").find({}).toArray();

    if (users.length === 0) {
      console.log("❌ No users found in database");
    } else {
      console.log(`Found ${users.length} user(s):\n`);
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   ID: ${user._id}`);
        console.log(`   Role: ${user.role || "N/A"}`);
        console.log(`   Created: ${user.createdAt || "N/A"}\n`);
      });
    }

    // Get collection stats
    const collections = await db.listCollections().toArray();
    console.log("\nDatabase Collections:");
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`- ${coll.name}: ${count} documents`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

listUsers();
