const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const { generateEmbedding, extractHiddenRoles } = require("./geminiService");
const { buildJobText, buildSeekerText } = require("../utils/textBuilders");

async function syncJobAiFields(jobId) {
  const job = await Job.findById(jobId);
  if (!job) {
    return null;
  }

  const jobText = buildJobText(job);
  const [embedding, hiddenRoles] = await Promise.all([
    generateEmbedding(jobText),
    extractHiddenRoles(jobText)
  ]);

  job.embedding = embedding || undefined;
  job.hiddenRoles = hiddenRoles || [];
  await job.save();
  return job;
}

async function syncSeekerAiFields(seekerId) {
  const seeker = await JobSeeker.findById(seekerId);
  if (!seeker) {
    return null;
  }

  const seekerText = buildSeekerText(seeker);
  const [embedding, hiddenRoles] = await Promise.all([
    generateEmbedding(seekerText),
    extractHiddenRoles(seekerText)
  ]);

  seeker.embedding = embedding || undefined;
  seeker.hiddenRoles = hiddenRoles || [];
  await seeker.save();
  return seeker;
}

async function syncSeekerEmbedding(seekerId) {
  return syncSeekerAiFields(seekerId);
}

function fireAndForget(promiseFactory, context = "") {
  Promise.resolve()
    .then(promiseFactory)
    .catch((error) => {
      const label = context ? `[fireAndForget:${context}]` : "[fireAndForget]";
      console.error(`${label} Async task failed:`, error?.message || "Unknown error");
      if (error?.stack) {
        console.error(`${label} Stack trace:`, error.stack);
      }
    });
}

module.exports = {
  syncJobAiFields,
  syncSeekerEmbedding,
  syncSeekerAiFields,
  fireAndForget
};
