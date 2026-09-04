/* ===============================================================================================
   Candidate retrieval, and what happens when Atlas Vector Search answers with nothing.
   ===============================================================================================
   $vectorSearch against an index that does not exist returns an EMPTY RESULT SET and does not
   throw. findCandidatesForJob used to `return rows` on that empty array, so every job-triggered
   auto-apply run and every recruiter-introduction run in the product's history examined zero
   candidates and recorded success. The keyword fallback on the next line was unreachable whenever
   the job had an embedding — which is always.

   These tests pin the three outcomes retrieval can have (rows, empty, thrown) and the warning that
   makes a degraded run legible. The empty case is the regression: without the fix it returns 0
   candidates and pushes no warning at all.

   Skips itself when no scratch MongoDB is reachable, so the suite still runs on a bare checkout.
   It NEVER touches the production URI — the connection string is hardcoded to a local scratch
   database and asserted before anything is written.
   =============================================================================================== */

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const SCRATCH_URI = process.env.RETRIEVAL_TEST_URI || "mongodb://127.0.0.1:27018/sgetai_retrieval_test";

const Job = require("../../models/Job");
const JobSeeker = require("../../models/JobSeeker");
const Organization = require("../../models/Organization");
const { findCandidatesForJob } = require("../autoApplyWorker");

let connected = false;

async function connect() {
  if (connected) return true;
  try {
    await mongoose.connect(SCRATCH_URI, { serverSelectionTimeoutMS: 1500 });
    assert.ok(!mongoose.connection.host.includes("mongodb.net"), "refusing to run against Atlas");
    connected = true;
    return true;
  } catch {
    return false;
  }
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

// A vector of the right shape. Its contents are irrelevant: every test here controls what the
// aggregation returns, and the real point is that findCandidatesForJob takes the vector branch at
// all — which it does for any non-empty embedding.
const EMBEDDING = new Array(768).fill(0.01);

async function makeSeeker(skills) {
  const id = unique();
  return JobSeeker.create({
    firstName: "Retrieval",
    lastName: "Probe",
    email: `retrieval-${id}@example.test`,
    username: `ret${id}`,
    passwordHash: "x",
    isPro: true,
    skills,
    autoApplyPreferences: { enabled: true }
  });
}

async function makeJob(skillsRequired) {
  const organization = await Organization.create({
    companyName: `Retrieval Co ${unique()}`,
    email: `retrieval-org-${unique()}@example.test`,
    passwordHash: "x"
  });

  return Job.create({
    title: "Retrieval Probe Engineer",
    organizationId: organization._id,
    skillsRequired,
    status: "Active",
    isActive: true,
    autoApplyEnabled: true,
    embedding: EMBEDDING
  });
}

// Replaces the $vectorSearch aggregation for the duration of one call, the way Atlas would behave.
async function withAggregate(impl, run) {
  const real = JobSeeker.aggregate.bind(JobSeeker);
  JobSeeker.aggregate = async (pipeline) =>
    JSON.stringify(pipeline).includes("$vectorSearch") ? impl() : real(pipeline);
  try {
    return await run();
  } finally {
    JobSeeker.aggregate = real;
  }
}

test("an empty vector result falls through to the keyword query instead of being believed", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker(["ReactRetrievalProbe"]);
  const job = await makeJob(["ReactRetrievalProbe"]);
  const warnings = [];

  const candidates = await withAggregate(
    () => [],
    () => findCandidatesForJob(job, warnings)
  );

  assert.ok(
    candidates.some((candidate) => candidate._id.toString() === seeker._id.toString()),
    "the opted-in seeker must be retrieved by the keyword fallback"
  );
  assert.match(warnings.join(" "), /returned no candidates/, "the degradation must be recorded");
});

test("a thrown vector search still falls back, as it always did", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker(["JavaRetrievalProbe"]);
  const job = await makeJob(["JavaRetrievalProbe"]);
  const warnings = [];

  const candidates = await withAggregate(
    () => { throw new Error("index not found"); },
    () => findCandidatesForJob(job, warnings)
  );

  assert.ok(candidates.some((candidate) => candidate._id.toString() === seeker._id.toString()));
  assert.match(warnings.join(" "), /Vector seeker search failed/);
});

test("a vector result with rows is used as-is and warns about nothing", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker(["GoRetrievalProbe"]);
  const job = await makeJob(["GoRetrievalProbe"]);
  const warnings = [];

  const candidates = await withAggregate(
    () => [{ _id: seeker._id, vectorScore: 0.91 }],
    () => findCandidatesForJob(job, warnings)
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].vectorScore, 0.91, "the vector path's own rows must be returned untouched");
  assert.deepEqual(warnings, [], "a working vector search is not a degradation");
});

test("retrieving nobody while opted-in seekers exist is recorded, not reported as a clean zero", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  await makeSeeker(["SomeSkillNobodyIsHiringFor"]);
  const job = await makeJob([`NoSeekerHasThisSkill${unique()}`]);
  const warnings = [];

  const candidates = await withAggregate(
    () => [],
    () => findCandidatesForJob(job, warnings)
  );

  assert.equal(candidates.length, 0);
  assert.match(warnings.join(" "), /opted-in seeker\(s\) exist/, "a zero-candidate run must explain itself");
});

test.after(async () => {
  if (!connected) return;
  await Promise.all([
    JobSeeker.deleteMany({ email: /^retrieval-/ }),
    Organization.deleteMany({ email: /^retrieval-org-/ }),
    Job.deleteMany({ title: "Retrieval Probe Engineer" })
  ]);
  await mongoose.disconnect();
});
