const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");

async function debugAutoApply() {
  try {
    console.log("\n=== DEBUG AUTO-APPLY CANDIDATE MATCHING ===\n");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Get the most recently created test job
    const testJob = await Job.findOne({
      title: { $regex: "AUTO-APPLY TEST JOB" }
    }).sort({ createdAt: -1 });

    if (!testJob) {
      throw new Error("No test job found");
    }

    console.log(`Test Job: "${testJob.title}"`);
    console.log(`Job ID: ${testJob._id}`);
    console.log(`Skills: ${testJob.skills.join(", ")}`);
    console.log(`Skills Required: ${testJob.skillsRequired.join(", ")}`);
    console.log(`Requirements: ${testJob.requirements.join(", ")}\n`);

    // Check Pro users with auto-apply
    console.log("Pro Users with Auto-Apply Enabled:");
    const proUsers = await JobSeeker.find({
      isPro: true,
      "autoApplyPreferences.enabled": true
    }).select("firstName lastName email skills autoApplyPreferences");

    console.log(`Found: ${proUsers.length} users\n`);

    proUsers.forEach((user, idx) => {
      console.log(`${idx + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`   Skills: ${(user.skills || []).slice(0, 5).join(", ")}`);
      console.log(`   Threshold: ${user.autoApplyPreferences?.matchThreshold}`);
      console.log(`   Preferred Roles: ${(user.autoApplyPreferences?.rolePreferences || []).join(", ")}`);
      console.log(`   Hidden Roles: ${(user.hiddenRoles || []).join(", ")}\n`);
    });

    // Simulate the text-based fallback query
    console.log("\n=== SIMULATING TEXT-BASED FALLBACK QUERY ===\n");

    const tokens = [
      ...(testJob.hiddenRoles || []),
      ...(testJob.skillsRequired || []),
      ...(testJob.skills || []),
      testJob.title
    ]
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean);

    console.log(`Tokens to match: ${tokens.join(", ")}\n`);

    const fallbackQuery = {
      isPro: true,
      "autoApplyPreferences.enabled": true,
      $or: [
        { hiddenRoles: { $in: tokens } },
        { skills: { $in: tokens } },
        { "skillGroups.skills": { $in: tokens } },
        { preferredRoles: { $in: tokens } },
        { "autoApplyPreferences.rolePreferences": { $in: tokens } }
      ]
    };

    const matches = await JobSeeker.find(fallbackQuery).select("firstName lastName email skills");
    console.log(`Candidates matching fallback query: ${matches.length}\n`);

    if (matches.length > 0) {
      console.log("Matching candidates:");
      matches.slice(0, 3).forEach((user, idx) => {
        console.log(`  ${idx + 1}. ${user.firstName} ${user.lastName}`);
        console.log(`     Skills: ${(user.skills || []).join(", ")}`);
      });
    } else {
      console.log("⚠️  No candidates matched the fallback query!");
      console.log("\nDebugging:");
      console.log("- Checking if Pro users have required skills...");
      for (const user of proUsers) {
        const hasSkill = (user.skills || []).some((s) => tokens.includes(s.toLowerCase()));
        console.log(`  ${user.firstName}: ${hasSkill ? "✓" : "✗"}`);
      }
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Debug failed:", error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

debugAutoApply();
