require("dotenv").config();

const mongoose = require("mongoose");
const { connectToDatabase } = require("../config/db");
const Organization = require("../models/Organization");
const { domainCheck } = require("../utils/domainCheck");

async function main() {
  await connectToDatabase();

  const organizations = await Organization.find({
    verificationStatus: { $ne: "Verified" }
  }).select("companyName email websiteUrl verificationStatus domainMatched");

  let verifiedCount = 0;
  let skippedCount = 0;

  for (const organization of organizations) {
    const matched = domainCheck(organization.email, organization.websiteUrl);

    if (!matched) {
      skippedCount += 1;
      continue;
    }

    organization.domainMatched = true;
    organization.verificationStatus = "Verified";
    await organization.save();
    verifiedCount += 1;

    console.log(`Verified: ${organization.companyName} <${organization.email}>`);
  }

  console.log(`\nDone. Verified ${verifiedCount} organization(s), skipped ${skippedCount}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
