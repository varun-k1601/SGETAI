// The Atlas Vector Search indexes this application requires, as data.
//
// WHY THIS FILE EXISTS: these indexes previously lived only in the Atlas console, and when
// jobseekers.vector_index was absent, $vectorSearch answered with an EMPTY RESULT SET instead of
// an error — so every job-triggered auto-apply and recruiter-introduction run "succeeded" having
// examined nobody. A required index that is only ever created by hand is invisible to code review,
// to a new environment, and to anyone diagnosing that silence. Definitions live here so the
// worker, the ensure script, and docs/atlas-search-indexes.md cannot drift apart.
//
// Creating or dropping an index NEVER changes who is eligible for anything — every eligibility
// gate is re-checked per candidate in the workers. These indexes only decide how candidates are
// RETRIEVED, and both workers fall back to a keyword query when retrieval comes back empty.

// Matches the dimensionality of the embedding model used by embeddingService.
const EMBEDDING_DIMENSIONS = 768;

const ATLAS_SEARCH_INDEXES = [
  {
    collection: "jobseekers",
    name: "vector_index",
    type: "vectorSearch",
    // Read by autoApplyWorker.findCandidatesForJob (auto-apply AND the three recruiter-
    // introduction automations, which share that function).
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: EMBEDDING_DIMENSIONS,
          similarity: "cosine"
        },
        // Atlas rejects a $vectorSearch `filter` on any path not declared here, so every field the
        // callers filter on must be listed. autoApplyPreferences.enabled is the auto-apply opt-in;
        // autoIntroduceToRecruiters is the separate introductions opt-in used by
        // recruiterIntroductionWorker's INTRODUCTION_CANDIDATE_FILTER.
        { type: "filter", path: "isPro" },
        { type: "filter", path: "autoApplyPreferences.enabled" },
        { type: "filter", path: "autoApplyPreferences.autoIntroduceToRecruiters" }
      ]
    }
  },
  {
    collection: "jobs",
    name: "vector_index",
    type: "vectorSearch",
    // Read by recommendationController, dashboardController and proFeaturesController, all of
    // which filter on status.
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: EMBEDDING_DIMENSIONS,
          similarity: "cosine"
        },
        { type: "filter", path: "status" }
      ]
    }
  }
];

module.exports = { ATLAS_SEARCH_INDEXES, EMBEDDING_DIMENSIONS };
