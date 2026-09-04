// Creates (or reports on) the Atlas Vector Search indexes declared in
// src/config/atlasSearchIndexes.js.
//
// WHY: $vectorSearch against a missing index returns zero rows WITHOUT throwing. Auto-apply and
// all three recruiter-introduction automations retrieve their candidates that way, so a missing
// index made every job-triggered run quietly examine nobody. Both workers now treat an empty
// vector result as a miss and fall back to a keyword query, so this script is what restores
// semantic retrieval rather than what makes the features work at all.
//
// Idempotent: an index that already exists is reported and left alone. Nothing is dropped, and no
// document is ever modified.
//
// Usage: node src/scripts/ensureAtlasSearchIndexes.js --dry-run   (report only, creates nothing)
//        node src/scripts/ensureAtlasSearchIndexes.js --only=jobseekers
//        node src/scripts/ensureAtlasSearchIndexes.js
//        npm run indexes:ensure
//
// --only=<collection> exists because creating an index is not a neutral act: jobs.vector_index
// switches the seeker recommendation feed from its keyword fallback back onto semantic ranking,
// which is a visible change to what people see. Being able to fix one collection at a time keeps
// that a deliberate choice.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const { ATLAS_SEARCH_INDEXES } = require("../config/atlasSearchIndexes");

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((arg) => arg.startsWith("--only=")) || "").split("=")[1] || null;

async function listExisting(db, collection) {
  try {
    return await db.collection(collection).listSearchIndexes().toArray();
  } catch (error) {
    // A non-Atlas deployment (a local mongod, or a self-hosted replica set) has no notion of
    // search indexes at all. Say so plainly rather than reporting "index missing", which would
    // send someone hunting in an Atlas console that does not govern this cluster.
    return { error };
  }
}

async function ensureAtlasSearchIndexes() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Connected to database "${db.databaseName}".`);
  console.log(DRY_RUN ? "DRY RUN — nothing will be created.\n" : "");

  let created = 0;
  let existing = 0;
  let failed = 0;

  const targets = ONLY
    ? ATLAS_SEARCH_INDEXES.filter((index) => index.collection === ONLY)
    : ATLAS_SEARCH_INDEXES;

  if (ONLY && !targets.length) {
    console.log(`No index is declared for collection "${ONLY}".`);
    await mongoose.disconnect();
    return;
  }

  for (const index of targets) {
    const label = `${index.collection}.${index.name}`;
    const found = await listExisting(db, index.collection);

    if (found?.error) {
      console.log(`  ${label}: cannot list search indexes — ${found.error.message}`);
      console.log("    This cluster does not support Atlas Search. The workers will use their keyword fallback.");
      failed += 1;
      continue;
    }

    const match = found.find((candidate) => candidate.name === index.name);

    if (match) {
      const fields = match.latestDefinition?.fields || match.definition?.fields || [];
      const filters = fields.filter((field) => field.type === "filter").map((field) => field.path);
      const vector = fields.find((field) => field.type === "vector");
      console.log(`  ${label}: EXISTS (status ${match.status || "?"}, queryable ${match.queryable})`);
      console.log(`    vector: ${vector?.path} ${vector?.numDimensions}d ${vector?.similarity} | filters: ${filters.join(", ") || "none"}`);

      // Reported, not repaired: updating an index rebuilds it, which is a live-traffic decision
      // for a human to make deliberately rather than a side effect of running a check.
      const expected = index.definition.fields.filter((f) => f.type === "filter").map((f) => f.path);
      const missingFilters = expected.filter((p) => !filters.includes(p));
      if (missingFilters.length) {
        console.log(`    WARNING: filter path(s) not declared: ${missingFilters.join(", ")}`);
        console.log("    Atlas rejects $vectorSearch filters on undeclared paths — those callers fall back to keyword search.");
      }
      existing += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ${label}: MISSING — would create:`);
      console.log(JSON.stringify({ name: index.name, type: index.type, definition: index.definition }, null, 2).split("\n").map((l) => `      ${l}`).join("\n"));
      continue;
    }

    try {
      await db.collection(index.collection).createSearchIndex({
        name: index.name,
        type: index.type,
        definition: index.definition
      });
      console.log(`  ${label}: CREATED — Atlas builds it asynchronously; it answers queries once status is READY.`);
      created += 1;
    } catch (error) {
      console.log(`  ${label}: FAILED — ${error.message}`);
      failed += 1;
    }
  }

  if (ONLY) {
    const skipped = ATLAS_SEARCH_INDEXES.filter((index) => index.collection !== ONLY);
    if (skipped.length) {
      console.log(`\nNot examined (--only=${ONLY}): ${skipped.map((index) => `${index.collection}.${index.name}`).join(", ")}`);
    }
  }

  console.log(`\nCreated: ${created}  Already present: ${existing}  Failed/unsupported: ${failed}`);
  await mongoose.disconnect();
}

ensureAtlasSearchIndexes().catch((error) => {
  console.error("Index check failed:", error);
  process.exit(1);
});
