/* THE SEEKER TIER PREFIX.

   A Pro seeker browses /pro/home, /pro/jobs, /pro/profile...; a free seeker browses /home, /jobs,
   /profile. Both shapes mount the SAME component under the SAME guard — the prefix advertises the
   user's TIER, it does not gate anything. Nothing is Pro-only because it carries /pro, and nothing
   free loses access by shedding it.

   Every seeker path in the app is written clean (`to="/jobs"`), here and in the ~79 hardcoded
   links across the pages. This helper is applied at the two places that decide a URL up front —
   the sidebar nav and the post-login landing — so the common case never takes a redirect. Anything
   that still emits a clean path is caught by the canonicaliser in routes/AppRouter.jsx and
   rewritten in one hop, which is what makes the change safe without touching all 79. */
const PRO_PREFIX = "/pro";

// True only for a Pro-tier SEEKER. Never for a recruiter or an admin, whatever their session
// carries: /pro/* is the seeker workspace, and an organization on /pro/profile would be a bug even
// though the page renders. This one predicate is the single definition of "should see /pro".
export function isProSeekerSession(session) {
  return session?.role === "seeker" && Boolean(session?.isPro);
}

export function hasProPrefix(pathname) {
  return pathname === PRO_PREFIX || pathname.startsWith(`${PRO_PREFIX}/`);
}

export function stripProPrefix(pathname) {
  if (!hasProPrefix(pathname)) return pathname;
  // "/pro" alone strips to "/", not to "".
  return pathname.slice(PRO_PREFIX.length) || "/";
}

// Clean path in, tier-correct path out. Idempotent: handed a path that already carries the prefix
// it returns it untouched, so /pro/automations — genuinely Pro-gated and already prefixed — can
// never become /pro/pro/automations no matter how many times this is applied.
export function seekerPath(path, isProSeeker) {
  if (!isProSeeker || hasProPrefix(path)) return path;
  return `${PRO_PREFIX}${path}`;
}

/* Where a session belongs when it has no more specific destination: after login, registration and
   OAuth, at "/", and as the RoleRoute bounce target. Must stay in lockstep with the routes
   registered in routes/AppRouter.jsx — if it ever names a path that is not registered, a bounced
   user lands on NotFoundPage instead of their home.

   `isPro` is only ever consulted for seekers. Passing it wrong is self-correcting rather than
   fatal — the canonicaliser rewrites a wrong-tier landing in one hop — but getting it right here
   means a Pro seeker's URL bar reads /pro/home from the first paint. */
export function getHomePathForRole(role, isPro = false) {
  if (role === "SuperAdmin" || role === "Moderator") return "/admin/overview";
  if (role === "organization") return "/recruiter/overview";
  return seekerPath("/home", role === "seeker" && Boolean(isPro));
}
