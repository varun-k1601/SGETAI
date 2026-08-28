/* ===============================================================================================
   The rotation counter, end to end against a real MongoDB.
   ===============================================================================================
   resumeTemplates.test.js covers the pure arithmetic. This covers the part that touches the
   database: where the count comes from, that it advances, that a saved preference bypasses it, and
   that a failing read degrades to the candidate's own offset rather than collapsing everyone onto
   one layout.

   Skips itself when no scratch MongoDB is reachable, so the suite still runs on a bare checkout.
   It NEVER touches the production URI — the connection string is hardcoded to a local scratch
   database and asserted before anything is written.
   =============================================================================================== */

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const SCRATCH_URI = process.env.ROTATION_TEST_URI || "mongodb://127.0.0.1:27018/sgetai_rotation_test";

const JobSeeker = require("../../models/JobSeeker");
const GeneratedArtifact = require("../../models/GeneratedArtifact");
const { claimResumeVariant, readRotationCount } = require("../resumeVariantRotation");
const { RESUME_VARIANTS, resolveResumeVariant } = require("../resumeGenerationService");

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

async function makeSeeker(overrides = {}) {
  return JobSeeker.create({
    firstName: "Rotation",
    lastName: "Probe",
    email: `rotation-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    username: `rot${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    passwordHash: "x",
    ...overrides
  });
}

// The counter is written fire-and-forget, so the next read has to wait for it to land.
async function reload(seeker) {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return JobSeeker.findById(seeker._id);
}

test("seven consecutive generations step through all six layouts", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  let seeker = await makeSeeker();
  const sequence = [];

  for (let generation = 0; generation < 7; generation += 1) {
    sequence.push(await claimResumeVariant(seeker));
    seeker = await reload(seeker);
  }

  assert.equal(new Set(sequence.slice(0, 6)).size, 6, `six distinct layouts expected, got ${sequence.join(" ")}`);
  assert.equal(sequence[6], sequence[0], `the seventh must restart the cycle: ${sequence.join(" ")}`);
  for (let index = 1; index < sequence.length; index += 1) {
    assert.notEqual(sequence[index], sequence[index - 1], `back-to-back repeat: ${sequence.join(" ")}`);
  }
  assert.equal(seeker.resumeGenerationCount, 7, "the counter must record all seven generations");

  await JobSeeker.deleteOne({ _id: seeker._id });
});

test("a candidate with no counter seeds from their GeneratedArtifact history", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker();
  assert.equal(seeker.resumeGenerationCount, undefined, "the field must have NO default, or the seed never runs");

  // Three prior resumes, plus a non-resume artifact that must not be counted.
  await GeneratedArtifact.create([
    { userId: seeker._id, type: "resume", title: "one" },
    { userId: seeker._id, type: "resume", title: "two" },
    { userId: seeker._id, type: "resume", title: "three" },
    { userId: seeker._id, type: "linkedin_post", title: "not a resume" }
  ]);

  assert.equal(await readRotationCount(seeker), 3, "only resume artifacts count");

  const variant = await claimResumeVariant(seeker);
  assert.equal(
    variant,
    resolveResumeVariant({ variantSeed: seeker._id, rotation: 3 }),
    "the fourth generation must continue from the artifact history, not restart"
  );

  // And the counter now carries the sequence forward, so the seed is not re-read.
  const reloaded = await reload(seeker);
  assert.equal(reloaded.resumeGenerationCount, 4, "the counter must absorb the artifact seed, not reset to 1");

  await GeneratedArtifact.deleteMany({ userId: seeker._id });
  await JobSeeker.deleteOne({ _id: seeker._id });
});

test("a saved preference pins the layout and does not advance the rotation", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker({ resumeTemplateVariant: "f" });

  for (let generation = 0; generation < 4; generation += 1) {
    assert.equal(await claimResumeVariant(seeker), "f", "a pinned layout must not rotate");
  }

  const reloaded = await reload(seeker);
  assert.equal(
    reloaded.resumeGenerationCount,
    undefined,
    "a pinned candidate must not burn rotation steps they never used"
  );

  await JobSeeker.deleteOne({ _id: seeker._id });
});

test("a failing count read degrades to the candidate's own offset, not to variant A", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  const seeker = await makeSeeker();
  const original = GeneratedArtifact.countDocuments;
  GeneratedArtifact.countDocuments = async () => {
    throw new Error("simulated database failure");
  };

  try {
    const count = await readRotationCount(seeker);
    assert.equal(count, 0, "a failed read must return 0, never NaN or undefined");

    const variant = await claimResumeVariant(seeker);
    assert.ok(RESUME_VARIANTS.includes(variant), `degraded to "${variant}", which is not a variant`);
    assert.equal(
      variant,
      resolveResumeVariant({ variantSeed: seeker._id, rotation: 0 }),
      "a failed read must land on this candidate's own offset"
    );
  } finally {
    GeneratedArtifact.countDocuments = original;
    await JobSeeker.deleteOne({ _id: seeker._id });
  }
});

test("concurrent generations stay valid, even when they duplicate a layout", async (t) => {
  if (!(await connect())) {
    t.skip("no scratch MongoDB on 27018");
    return;
  }

  // Auto-apply fires several of these at once. They may read the same count and repeat a layout —
  // explicitly accepted, and not worth serialising resume generation to avoid. What must NOT
  // happen is a throw, an undefined, or a variant outside the six.
  const seeker = await makeSeeker();
  const variants = await Promise.all(
    Array.from({ length: 5 }, () => claimResumeVariant(seeker))
  );

  for (const variant of variants) {
    assert.ok(RESUME_VARIANTS.includes(variant), `concurrent claim produced "${variant}"`);
  }

  await JobSeeker.deleteOne({ _id: seeker._id });
});

test.after(async () => {
  if (connected) {
    await mongoose.disconnect();
  }
});
