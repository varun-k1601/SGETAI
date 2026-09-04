# Atlas Search indexes

These are not optional extras. Two features retrieve their candidates through `$vectorSearch`, and
**`$vectorSearch` against an index that does not exist returns an empty result set — it does not
throw.** A missing index therefore looks exactly like "nobody matched".

That is not hypothetical: `jobseekers.vector_index` had never been created on this cluster, so
every job-triggered auto-apply run in the product's history recorded `candidatesEvaluated: 0`,
`warnings: []`, `ready: true` — success, having examined nobody. All three recruiter-introduction
automations (auto-introduce, auto-connect, auto-DM) share the same retrieval call and had never
produced a single record.

The code no longer depends on these indexes being present (see *Degradation* below), but without
them retrieval is keyword-only.

## Source of truth

`src/config/atlasSearchIndexes.js` holds the definitions as data. Create or check them with:

```bash
npm run indexes:ensure                                    # create anything missing
node src/scripts/ensureAtlasSearchIndexes.js --dry-run    # report only
node src/scripts/ensureAtlasSearchIndexes.js --only=jobs  # one collection at a time
```

The script is idempotent, never drops or edits an existing index, and never touches a document. If
an index exists but is missing a declared filter path it says so and leaves it alone — rebuilding a
live index is a decision for a human.

## `jobseekers.vector_index`

Read by `autoApplyWorker.findCandidatesForJob`, which serves **both** auto-apply and the recruiter
introduction worker.

```json
{
  "name": "vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
      { "type": "filter", "path": "isPro" },
      { "type": "filter", "path": "autoApplyPreferences.enabled" },
      { "type": "filter", "path": "autoApplyPreferences.autoIntroduceToRecruiters" }
    ]
  }
}
```

768 dimensions because that is what `embeddingService` produces; a mismatch makes Atlas reject the
query outright.

All three filter paths must be declared. Atlas rejects a `$vectorSearch` whose `filter` names an
undeclared path, so an index without `autoApplyPreferences.autoIntroduceToRecruiters` silently
demotes the recruiter-introduction worker to keyword retrieval even though the index exists.

## `jobs.vector_index`

Read by `recommendationController`, `dashboardController` and `proFeaturesController` — the seeker
job feed and its Pro variants. Also currently absent, which is why those surfaces run on their own
fallbacks.

```json
{
  "name": "vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
      { "type": "filter", "path": "status" }
    ]
  }
}
```

Creating this one changes what seekers see in their feed (semantic ranking instead of the
fallback), so it is deliberately left to a human decision rather than bundled into a fix for the
auto-apply bug. `--only=jobs` creates it when you want that.

## Degradation

`findCandidatesForJob` treats **both** a thrown error and an empty result as a retrieval miss and
falls through to a keyword query over the same eligibility filter, pushing a warning onto the run
record either way. So:

- A missing, dropped or still-building index degrades auto-apply and introductions to keyword
  matching. They keep working.
- The degradation is visible: the `AutoApplyRun` / `RecruiterIntroductionRun` document carries
  `Vector seeker search returned no candidates; used text fallback…`.
- A run that retrieves nobody while opted-in seekers exist records that too, rather than reporting
  a clean zero.

Neither fallback relaxes any eligibility check. Both workers re-verify `isPro` and the relevant
opt-in per candidate, precisely because a keyword query's filter was never vetted by Atlas.

## Recreating from scratch

Index builds are asynchronous. `listSearchIndexes()` reports `status: "PENDING"` then `"READY"`,
and `queryable: true` only when it can answer. Until then `$vectorSearch` returns zero rows — the
same silence as a missing index, which is the other reason the empty-result fallback exists.
