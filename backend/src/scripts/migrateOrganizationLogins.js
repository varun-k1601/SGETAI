// One-time migration: for every existing Organization document that still has its own
// email/passwordHash (the old shared-login model), create a corresponding OrganizationMember
// with role "Owner" carrying over that same email/passwordHash/name, so every currently-active
// recruiter account keeps working with their existing credentials after the multi-user-per-company
// change ships.
//
// Idempotent — safe to run more than once. Does NOT delete Organization.email/passwordHash; those
// stay in place as deprecated/unused fields for one release cycle per the migration plan.
//
// Usage: node src/scripts/migrateOrganizationLogins.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");

function deriveName(organization) {
  const representativeName = organization.representativeDetails?.name;
  const source = representativeName || organization.companyName || "Owner";
  const parts = String(source).trim().split(/\s+/);
  return {
    firstName: parts[0] || "Owner",
    lastName: parts.slice(1).join(" ") || "Account"
  };
}

async function migrateOrganizationLogins() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const organizations = await Organization.find({
    email: { $exists: true, $ne: null }
  }).select("+passwordHash");

  console.log(`Found ${organizations.length} organization(s) with a login email.\n`);

  let created = 0;
  let skippedExisting = 0;
  let skippedNoPassword = 0;

  for (const organization of organizations) {
    const existingOwner = await OrganizationMember.findOne({
      organizationId: organization._id,
      role: "Owner"
    });

    if (existingOwner) {
      skippedExisting += 1;
      continue;
    }

    if (!organization.passwordHash) {
      // OAuth-only organization with no password to migrate yet — nothing to carry over. It will
      // get a real Owner member the next time it registers/re-authenticates (ensureOwnerMember in
      // authController.js), same as any brand-new OAuth organization.
      skippedNoPassword += 1;
      continue;
    }

    const { firstName, lastName } = deriveName(organization);

    await OrganizationMember.create({
      organizationId: organization._id,
      firstName,
      lastName,
      email: organization.email,
      passwordHash: organization.passwordHash,
      role: "Owner",
      status: "Active"
    });

    created += 1;
    console.log(`✓ Migrated ${organization.companyName} (${organization.email}) -> Owner member`);
  }

  console.log("\nMigration complete.");
  console.log(`  Owner members created: ${created}`);
  console.log(`  Skipped (already had an Owner): ${skippedExisting}`);
  console.log(`  Skipped (no password to migrate — OAuth-only): ${skippedNoPassword}`);

  await mongoose.disconnect();
}

migrateOrganizationLogins().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
