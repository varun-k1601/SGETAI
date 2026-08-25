const { getSignedFileUrl, getSignedFileUrls } = require("../utils/supabaseService");

/* ===============================================================================================
   Media URL resolution — the ONE implementation.
   ===============================================================================================
   Media subdocuments (Organization.logo, JobSeeker.profilePicture, Post.media, ...) are stored as
   { filePath, fileType, url }. The stored `url` is the value uploadFile returned at upload time,
   which is a PUBLIC object URL — and the bucket is private, so fetching it returns
   400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}. Verified against the
   live bucket: the stored URL 400s, a signed URL for the same filePath returns 200 image/jpeg.

   That is why a company logo rendered as a broken <img> everywhere except an organization's own
   profile page. Two stacked bugs produced it:

     BUG 1  The only code that refreshed `url` was refreshReadableMediaUrl, private to
            profileController and reached only from buildProfileResponse — i.e. GET /profile/me,
            the caller's own media. Every other serializer passed the raw stored object through.
     BUG 2  ...and that helper (plus three near-identical copies in jobSearchController,
            connectionController and organizationController) called getReadableFileUrl, which
            builds the same dead /object/public/ URL.

   So this module exists to be the single place that answers "what URL can a browser actually
   fetch for this file", and it answers with getSignedFileUrl / getSignedFileUrls.

   ------------------------------------------------------------------------------------------------
   DO NOT swap this for a public bucket. The same bucket holds resumes and profile media; making it
   public would expose candidate documents to anyone with a path.

   ------------------------------------------------------------------------------------------------
   GRACEFUL DEGRADATION is a hard requirement, not a nicety. Every function here returns the media
   object UNCHANGED when signing fails or there is no filePath. CompanyLogo renders its letter
   fallback whenever `url` is falsy, so a signing outage degrades to initials rather than to broken
   images — and never to a thrown request.
   =============================================================================================== */

/* SIGNED URLS EXPIRE, and this deployment caches. Two layers to clear:

     nginx (nginx.conf)  `proxy_cache_valid 200 1m` on the backend upstream, `inactive=10m` on the
                         zone and `proxy_cache_use_stale ... updating`, so a stored entry can be
                         served for at most ~10 minutes.

                         `proxy_no_cache $http_authorization` keeps every AUTHENTICATED response out
                         of the cache entirely — that covers GET /jobs/:jobId, GET
                         /search/organizations and GET /profile/me. But two logo-emitting routes are
                         `optionalAuth` and so return 200 to an anonymous request:
                         GET /search/jobs (routes/search.js:12) and GET /organizations/:id
                         (routes/organizations.js:7). Those responses ARE cached, signed URLs and
                         all. This TTL is what makes that safe.
     TanStack Query      no gcTime is configured (main.jsx news up a bare QueryClient), so the
                         default 5-minute garbage-collection window applies and queries refetch on
                         mount.

   6 hours is ~36x the worst-case nginx window and ~72x the client window, and comfortably outlives
   a browsing session, so a cached payload can never hand out a dead signature. Chosen over marking
   those responses no-store, which would give up caching on the two hottest anonymous endpoints to
   solve a problem a longer expiry already solves. It is deliberately NOT the 3600s default and must
   never be lowered toward the cache TTLs. */
const MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

function isMediaObject(media) {
  return Boolean(media) && typeof media === "object";
}

function readFilePath(media) {
  return isMediaObject(media) && typeof media.filePath === "string" ? media.filePath : "";
}

// Mongoose documents are accepted throughout, because several callers populate without .lean().
// toObject() is deep, so a populated `organizationId` comes back as a plain nested object and does
// not need converting again — calling this on an already-plain object is a no-op.
function toPlain(value) {
  return value && typeof value.toObject === "function" ? value.toObject() : value;
}

/* The module's ONE rule for what comes back on a media object, so every resolver below degrades
   identically:

     no filePath            -> the object is returned untouched. There is nothing we could ever
                               sign, and it is not ours to edit.
     signed successfully    -> `url` is the fresh signed URL.
     signing produced nothing (outage, deleted object, throw)
                            -> `url` is REMOVED.

   That last case is the one worth spelling out. "Leave it untouched" sounds like the safe default,
   but the stored `url` is the /object/public/ link uploadFile persisted, and it is dead by
   construction against a private bucket — verified live: it returns
   400 {"code":"NoSuchBucket"} while a signed URL for the same filePath returns 200 image/jpeg.
   Preserving it does not preserve a working image; it re-renders the BROKEN one. CompanyLogo and
   every avatar renderer branch on `url` being falsy, so dropping the key is what actually produces
   the letter fallback. The key is omitted rather than set to "" so no consumer is ever handed an
   empty string dressed as a URL. */
function applySignedUrl(media, signedUrl) {
  if (signedUrl) {
    return { ...media, url: signedUrl };
  }

  const { url: _staleUrl, ...withoutUrl } = media;
  return withoutUrl;
}

/**
 * Resolve ONE media object. Prefer attachMediaUrlsInPlace for anything that runs over a list —
 * this is a single network round-trip and N of them is the N+1 that made list endpoints slow.
 */
async function attachMediaUrl(media) {
  const filePath = readFilePath(media);

  if (!filePath) {
    return media;
  }

  try {
    return applySignedUrl(media, await getSignedFileUrl(filePath, MEDIA_URL_TTL_SECONDS));
  } catch {
    return applySignedUrl(media, "");
  }
}

/**
 * Sign every distinct filePath among `mediaObjects` in ONE Supabase call and return a
 * Map of filePath -> signedUrl. Callers that hold their own object graph can use this directly.
 */
async function signMediaBatch(mediaObjects = []) {
  const filePaths = mediaObjects.map(readFilePath).filter(Boolean);

  if (!filePaths.length) {
    return new Map();
  }

  try {
    return await getSignedFileUrls(filePaths, MEDIA_URL_TTL_SECONDS);
  } catch {
    // Whole-batch failure degrades the entire page to initials rather than failing the request.
    return new Map();
  }
}

/**
 * Batch-resolve a list of media objects. Returns NEW objects; inputs are not mutated. Objects
 * without a filePath, or whose path could not be signed, come back untouched.
 */
async function attachMediaUrls(mediaObjects = []) {
  const signedUrlByPath = await signMediaBatch(mediaObjects);

  return mediaObjects.map((media) => {
    const filePath = readFilePath(media);

    if (!filePath) {
      return media;
    }

    return applySignedUrl(media, signedUrlByPath.get(filePath));
  });
}

/**
 * The common case: a list of plain organization objects, each possibly carrying `logo`.
 * One Supabase call for the whole page. Mongoose documents are accepted and converted, because
 * several callers populate without .lean().
 */
async function attachOrganizationLogos(organizations = []) {
  const plainOrganizations = organizations.map(toPlain);

  const logos = plainOrganizations.map((organization) => organization?.logo).filter(isMediaObject);
  const signedUrlByPath = await signMediaBatch(logos);

  return plainOrganizations.map((organization) => {
    const filePath = readFilePath(organization?.logo);

    if (!filePath) {
      return organization;
    }

    return {
      ...organization,
      logo: applySignedUrl(organization.logo, signedUrlByPath.get(filePath))
    };
  });
}

/**
 * Records that populate an employer into `organizationId` — Job documents from the search and
 * recommendation lists, Application documents from GET /applications/mine. Both models name the
 * field `organizationId` and both are read by CompanyLogo, so they want the same treatment; this
 * used to be attachJobOrganizationLogos, whose job-specific name is why /applications/mine was
 * never wired up to it and stayed the last seeker-facing list serving dead logo URLs.
 *
 * Delegates to attachOrganizationLogos so the signing rule lives in exactly one place, and
 * reattaches by index. One Supabase call for the whole page: signMediaBatch -> getSignedFileUrls
 * deduplicates paths, so a seeker with five applications to the same employer — or an employer
 * owning five jobs — costs ONE signature, not five.
 */
async function attachPopulatedOrganizationLogos(records = []) {
  const plainRecords = records.map(toPlain);

  // Index-aligned with plainRecords. Only records whose organizationId is a populated employer
  // CARRYING A LOGO are resolved: an un-populated organizationId is still a bare ObjectId (also
  // typeof "object", so the `logo` test is what excludes it), and an employer that never uploaded
  // one has nothing to sign. Both pass through byte-for-byte, which is what leaves CompanyLogo to
  // render its letter fallback.
  const organizations = plainRecords.map((record) =>
    isMediaObject(record?.organizationId) && isMediaObject(record.organizationId.logo)
      ? record.organizationId
      : null
  );

  if (!organizations.some(Boolean)) {
    return plainRecords;
  }

  const presentIndexes = organizations.reduce(
    (indexes, organization, index) => (organization ? indexes.concat(index) : indexes),
    []
  );
  const resolved = await attachOrganizationLogos(presentIndexes.map((index) => organizations[index]));
  const resolvedByIndex = new Map(presentIndexes.map((index, position) => [index, resolved[position]]));

  return plainRecords.map((record, index) =>
    resolvedByIndex.has(index) ? { ...record, organizationId: resolvedByIndex.get(index) } : record
  );
}

module.exports = {
  MEDIA_URL_TTL_SECONDS,
  attachMediaUrl,
  attachMediaUrls,
  attachOrganizationLogos,
  attachPopulatedOrganizationLogos,
  signMediaBatch
};
