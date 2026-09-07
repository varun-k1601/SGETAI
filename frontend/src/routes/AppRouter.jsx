import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { ProtectedRoute, ProRoute, RoleRoute } from "./ProtectedRoute";
import { AppShell } from "../layouts/AppShell";
import { useAuth } from "../context/AuthContext";
import {
  getHomePathForRole,
  hasProPrefix,
  isProSeekerSession,
  seekerPath,
  stripProPrefix
} from "../utils/roleHome";
import { LoginPage } from "../pages/auth/LoginPage";
import { OAuthCallbackPage } from "../pages/auth/OAuthCallbackPage";
import { OAuthCompleteRecruiterPage } from "../pages/auth/OAuthCompleteRecruiterPage";
import { AcceptTeamInvitePage } from "../pages/auth/AcceptTeamInvitePage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { RecruiterDashboardPage } from "../pages/dashboard/RecruiterDashboardPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminCandidatesPage } from "../pages/admin/AdminCandidatesPage";
import { AdminApplicationsPage } from "../pages/admin/AdminApplicationsPage";
import { AdminRecruiterPipelinePage } from "../pages/admin/AdminRecruiterPipelinePage";
import { AdminSkillsProgressPage } from "../pages/admin/AdminSkillsProgressPage";
import { AdminGrowthOperationsPage } from "../pages/admin/AdminGrowthOperationsPage";
import { AdminHrmsPage } from "../pages/admin/AdminHrmsPage";
import { SupportInboxPage } from "../pages/admin/SupportInboxPage";
import { AdminBillingPage } from "../pages/admin/AdminBillingPage";
import { AdminApiHealthPage } from "../pages/admin/AdminApiHealthPage";
import { JobsPage } from "../pages/jobs/JobsPage";
import { JobDetailPage } from "../pages/jobs/JobDetailPage";
import { RecruiterJobsPage } from "../pages/jobs/RecruiterJobsPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { ResumeBuilderPage } from "../pages/resume/ResumeBuilderPage";
import { ResumeAtsCheckerPage } from "../pages/resume/ResumeAtsCheckerPage";
import { FeedPage } from "../pages/feed/FeedPage";
import { CreatePostPage } from "../pages/feed/CreatePostPage";
import { ChatPage } from "../pages/chat/ChatPage";
import { UpgradePage } from "../pages/subscriptions/UpgradePage";
import { ProToolsPage } from "../pages/pro/ProToolsPage";
import { ApplicationsPage } from "../pages/applications/ApplicationsPage";
import { RecruiterApplicationsPage } from "../pages/applications/RecruiterApplicationsPage";
import { RecruiterJobApplicantsPage } from "../pages/applications/RecruiterJobApplicantsPage";
import { NotificationsPage } from "../pages/notifications/NotificationsPage";
import { FollowsPage } from "../pages/follows/FollowsPage";
import { ConnectionsPage } from "../pages/connections/ConnectionsPage";
import { OrganizationPage } from "../pages/organizations/OrganizationPage";
import { VerificationSubmitPage } from "../pages/verification/VerificationSubmitPage";
import { LearnPage } from "../pages/learn/LearnPage";
import { HelpPage } from "../pages/help/HelpPage";
import { AIGeneratorPage } from "../pages/pro/AIGeneratorPage";
import { AutomationsPage } from "../pages/pro/AutomationsPage";
import { LinkedInConnectCallbackPage } from "../pages/pro/LinkedInConnectCallbackPage";
import { SettingsPage } from "../pages/pro/SettingsPage";
import { RecruiterOverviewPage } from "../pages/recruiter/RecruiterOverviewPage";
import { RecruiterJobPostingsPage } from "../pages/recruiter/RecruiterJobPostingsPage";
import { RecruiterJobFormPage } from "../pages/recruiter/RecruiterJobFormPage";
import { RecruiterCandidatesPage } from "../pages/recruiter/RecruiterCandidatesPage";
import { RecruiterCompanyPostsPage } from "../pages/recruiter/RecruiterCompanyPostsPage";
import { RecruiterBackgroundCheckPage } from "../pages/recruiter/RecruiterBackgroundCheckPage";
import { RecruiterIntegrationsPage } from "../pages/recruiter/RecruiterIntegrationsPage";
import { RecruiterCalendarCallbackPage } from "../pages/recruiter/RecruiterCalendarCallbackPage";
import { RecruiterMessagesPage } from "../pages/recruiter/RecruiterMessagesPage";
import { RecruiterSettingsPage } from "../pages/recruiter/RecruiterSettingsPage";
import { NotFoundPage } from "../pages/NotFoundPage";

function RoleHomeRedirect() {
  const { session, isBootstrapping } = useAuth();

  /* WAIT FOR THE SESSION BEFORE CHOOSING A DESTINATION. This route is not behind ProtectedRoute,
     so on a HARD load of "/" it rendered on the very first paint, while AuthContext was still
     restoring the session from storage. session?.role was therefore undefined, and
     getHomePathForRole falls through to "/home" for any role it does not recognise — so an admin
     or a recruiter opening "/" cold was sent to the SEEKER feed and left there.

     It never surfaced as a 404 precisely because /home admits admins by a documented cross-role
     allowance and simply rendered, and because an in-app click to "/" works fine: by then the
     session is in memory. Only the cold load was wrong, which is why clicking around never
     revealed it.

     Redirecting is a decision that cannot be taken back once `replace` has run, so it must not be
     taken on incomplete information. ProtectedRoute and RoleRoute already hold for exactly this
     reason; this route was the one that did not. */
  if (isBootstrapping) {
    return <section className="loading-state">Loading your workspace...</section>;
  }

  return <Navigate to={getHomePathForRole(session?.role, session?.isPro)} replace />;
}

/* ===============================================================================================
   THE SEEKER TIER PREFIX — dual registration plus one canonicaliser.
   ===============================================================================================
   A Pro seeker's URLs carry /pro; a free seeker's do not. Same page, same component, same guard —
   the prefix reflects the USER'S TIER, not the route's gating.

   THE SAFETY PROPERTY, restated because this deliberately reintroduces two URLs per page.
   /pro/notifications was collapsed earlier precisely because one page mounted at two URLs "under
   different rules" is how the paywalled-bell bug survived. Two URLs are safe here, and only here,
   because of two invariants that must both hold:

     1. BOTH shapes mount the SAME element under the SAME guard. tierRoutes() below emits the pair
        from a single entry, inside whatever wrapper the group already has, so the two cannot drift
        apart or acquire different rules. The failure mode to avoid is putting the /pro/* copies
        behind <ProRoute /> — that would recreate the old bug exactly. They are not.
     2. Exactly one of the two is ever DISPLAYED for a given user, because TierCanonical rewrites
        the other away on sight.

   Access control is untouched: nothing here gates anything. A free seeker who types /pro/jobs is
   rewritten to /jobs and sees the page — never sent to /upgrade, because /jobs was never gated.
   =============================================================================================== */

// Emits both shapes of each shared seeker route from one entry. Used INSIDE an existing group so
// the pair inherits that group's guard and shell — never as a way to introduce a second wrapper.
function tierRoutes(entries) {
  return entries.flatMap(([path, element]) => [
    <Route key={path} path={path} element={element} />,
    <Route key={`/pro${path}`} path={`/pro${path}`} element={element} />
  ]);
}

/* Rewrites the URL to match the viewer's tier, then renders the route underneath. Sits ABOVE
   <AppShell /> in every group that uses it so a rewrite renders nothing at all — no shell flash
   on the way through.

   The test is exactly `role === "seeker" && isPro` (isProSeekerSession), never "has a session",
   "not an admin", or isPro alone. That matters because most of the routes this wraps are NOT
   seeker-exclusive: /home and /jobs admit admins, /profile admits organizations, /chat and
   /connections admit anyone authenticated. An admin on /home or a recruiter on /profile is not a
   Pro seeker, so the first branch never fires for them and they keep their clean URL.

   The second branch is what catches them coming the other way: a recruiter who somehow reaches
   /pro/profile is not a Pro seeker either, so the prefix is stripped and they land on /profile.
   That is the branch that also serves free seekers and stale /pro/* bookmarks.

   `replace` on both, so the rewritten-away URL never enters history and Back cannot bounce the
   user forward into the redirect again. Search and hash are carried across; without them a deep
   link like /jobs?q=react#top would lose everything after the path. */
function TierCanonical() {
  const { session } = useAuth();
  const { pathname, search, hash } = useLocation();
  const isProSeeker = isProSeekerSession(session);
  const prefixed = hasProPrefix(pathname);

  /* `to` is an OBJECT rather than a template string: it states pathname, search and hash as three
     separate fields, so none of them can be lost to string parsing. Verified end to end —
     /learn#top rewrites to /pro/learn#top and /jobs?q=react#top to /pro/jobs?q=react#top, query
     and fragment intact. */
  if (isProSeeker && !prefixed) {
    return <Navigate to={{ pathname: `/pro${pathname}`, search, hash }} replace />;
  }
  if (!isProSeeker && prefixed) {
    return <Navigate to={{ pathname: stripProPrefix(pathname), search, hash }} replace />;
  }

  return <Outlet />;
}

// One-hop redirect to a tier-correct destination, for a legacy path with no clean-path twin.
function TierHomeRedirect({ to }) {
  const { session } = useAuth();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: seekerPath(to, isProSeekerSession(session)), search, hash }} replace />;
}

/* ===============================================================================================
   LEGACY PATH REDIRECT — for paths that were renamed, not re-tiered.
   ===============================================================================================
   /pro/tools, /pro/ai, /pro/jobs, /pro/applied, /pro/learn, /pro/help, /pro/settings and
   /pro/profile all sat in plain seeker (or seeker+organization) groups with NO ProRoute, so every
   seeker — free or paid — browsed URLs that claimed otherwise. Each now has a clean canonical path
   and the old one redirects to it.

   The old paths are KEPT, not renamed. They are in bookmarks, in sent email and in links already
   in the wild, and a 404 on an old URL would be a worse bug than the one being fixed.

   Genuinely Pro-gated routes keep the prefix, because there it is accurate: /pro/automations and
   /pro/linkedin/callback. /pro/notifications was in that list until the page turned out not to be
   Pro-gated on the server at all; it now redirects to /notifications like the rest.

   `to` may contain :params — /pro/jobs/:jobId has to carry its id across — and the query string
   and hash are preserved so /pro/profile?section=skills still lands on the right section. */
function LegacyRedirect({ to }) {
  const params = useParams();
  const { search, hash } = useLocation();
  const target = to.replace(/:([A-Za-z0-9_]+)/g, (whole, name) => params[name] ?? whole);
  return <Navigate to={`${target}${search}${hash}`} replace />;
}

// /notifications is the SHARED path and stays exactly as reachable as it was. This only
// canonicalises the URL for organizations, which now have /recruiter/notifications alongside
// every other /recruiter/* page.
//
// It cannot loop: /recruiter/notifications mounts NotificationsPage directly, not this wrapper,
// so the redirect fires at most once. It cannot catch admins either — the test is an explicit
// equality against "organization", and it has to be: /recruiter/notifications sits inside
// RoleRoute allowedRoles={["organization"]}, so redirecting an admin there would bounce them
// straight back out. Seekers reaching this path render in place, unchanged.
function NotificationsRoute() {
  const { session } = useAuth();

  if (session?.role === "organization") {
    return <Navigate to="/recruiter/notifications" replace />;
  }

  return <NotificationsPage />;
}

// The same forwarding NotificationsRoute does, one level up. An organization on either shape of
// the shared profile path is sent to /recruiter/profile, where their own profile now lives
// alongside every other /recruiter/* page; everyone else renders the shared route underneath
// unchanged.
//
// It sits ABOVE TierCanonical rather than being the route's element (which is where
// NotificationsRoute sits) so that BOTH /profile and /pro/profile forward in ONE hop. As an
// element it would run after the canonicaliser, making a recruiter on the legacy /pro/profile
// take two: strip the prefix, then forward. Placing it here also means organizations never enter
// the tier machinery at all, which is the honest description of the arrangement — tier prefixes
// are a seeker concept.
//
// It cannot loop: /recruiter/profile is registered inside the recruiter group, not under this
// wrapper, so the redirect fires at most once. It cannot catch anyone else either — the test is
// an explicit equality against "organization". Seekers of both tiers fall through to <Outlet />
// and are not redirected.
function SharedProfileRoute() {
  const { session } = useAuth();

  if (session?.role === "organization") {
    return <Navigate to="/recruiter/profile" replace />;
  }

  return <Outlet />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RoleHomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/oauth/complete-recruiter" element={<OAuthCompleteRecruiterPage />} />
      <Route path="/team/accept-invite" element={<AcceptTeamInvitePage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verification" element={<VerificationSubmitPage />} />

      {/* LEGACY /pro/* PATHS. Guarded by ProtectedRoute alone — deliberately NOT by the role
          allowlist of their destination. A redirect that also role-checked would decide twice and
          could bounce a user off a rule the canonical route would have applied differently; here
          the redirect only rewrites the URL and the canonical route is the single authority on who
          may see it. No AppShell either: nothing renders, so there is no shell flash.

          These cannot loop. Every arrow points from a /pro path to a canonical one and no
          canonical path ever redirects back, so the chain is one hop and terminates. A role that
          may not see the destination is then bounced once more to its own home by RoleRoute —
          still terminating, because every role's home is a route that role is allowed. */}
      <Route element={<ProtectedRoute />}>
        {/* The ten /pro/* -> clean-path redirects that used to live here are GONE, deliberately.
            They pointed the opposite way to the tier canonicaliser and the two together would have
            looped forever for a Pro seeker:

                /pro/jobs -> (legacy) -> /jobs -> (canonicaliser, user is Pro) -> /pro/jobs -> ...

            The bookmarks they existed to serve are now served better by dual registration: every
            one of those ten paths is a REGISTERED route again, so a /pro/* bookmark resolves
            directly instead of bouncing, and the canonicaliser additionally handles the reverse
            direction, which a one-way redirect never could. A free seeker opening a stale
            /pro/jobs bookmark now lands on /jobs; a Pro seeker opening a /jobs bookmark lands on
            /pro/jobs. Neither 404s and neither is paywalled.

            /pro alone has no clean-path twin, so it stays a redirect — repointed to be
            tier-aware so it still resolves in ONE hop rather than bouncing through /tools. */}
        <Route path="/pro" element={<TierHomeRedirect to="/tools" />} />
        {/* THE ADMIN CONSOLE HOME'S TWO FORMER PATHS. /dashboard/overview was the console home and
            /dashboard/admin was already a legacy alias pointing AT it, so both are certainly
            bookmarked after a product lifetime of service and neither may 404.

            Both aim directly at /admin/overview. /dashboard/admin is deliberately NOT left aimed
            at /dashboard/overview: that would make it a redirect to a redirect, two hops for a URL
            that can just as easily take one.

            They sit in this block rather than in the admin group so they inherit the convention
            above — the redirect only rewrites the URL and never role-checks, leaving the canonical
            route as the single authority on who may see it. A seeker who hits /dashboard/overview
            is therefore rewritten to /admin/overview and THEN bounced to /home by RoleRoute: one
            extra hop, still terminating, and it cannot loop because /home is a route seekers are
            allowed. */}
        <Route path="/dashboard/overview" element={<LegacyRedirect to="/admin/overview" />} />
        <Route path="/dashboard/admin" element={<LegacyRedirect to="/admin/overview" />} />
        {/* Pre-dates the /pro group; /applied is canonical because it is the label the nav uses
            ("Applied Jobs") and the path the brief names. */}
        <Route path="/applications" element={<LegacyRedirect to="/applied" />} />
        {/* /upgrade is deliberately never prefixed, which leaves /pro/upgrade unregistered — and a
            Pro seeker whose every other URL carries /pro can reasonably type it. Redirecting is
            friendlier than the 404 it would otherwise hit. It cannot loop: /upgrade sits outside
            the canonicaliser, so nothing sends it back. */}
        <Route path="/pro/upgrade" element={<LegacyRedirect to="/upgrade" />} />
      </Route>

      {/* Seeker-only routes. Nothing in this group is Pro-GATED — a free seeker reaches every one
          of them — so both tier shapes are registered here together and TierCanonical picks which
          one the viewer sees. Genuinely Pro-only routes live in their own group at the bottom of
          this file and are NOT dual-registered. */}
      <Route element={<RoleRoute allowedRoles={["seeker"]} />}>
        <Route element={<TierCanonical />}>
          <Route element={<AppShell />}>
            {tierRoutes([
              ["/tools", <ProToolsPage />],
              ["/ai", <AIGeneratorPage />],
              ["/applied", <ApplicationsPage />],
              ["/learn", <LearnPage />],
              ["/help", <HelpPage />],
              ["/settings", <SettingsPage />],
              ["/resume-builder", <ResumeBuilderPage />],
              ["/ats-checker", <ResumeAtsCheckerPage />],
              ["/following", <FollowsPage />]
            ])}
          </Route>
        </Route>

        {/* /upgrade is deliberately OUTSIDE the canonicaliser and single-registered. It is the
            free tier's own page — the thing a Pro seeker has already done — so /pro/upgrade is a
            contradiction in terms, and prefixing it would put the paywall pitch behind a URL that
            announces the user does not need it. */}
        <Route element={<AppShell />}>
          <Route path="/upgrade" element={<UpgradePage />} />
        </Route>
      </Route>

      {/* ProfilePage is shared — ONE component that branches internally on session.role to render
          either a seeker or an organization profile (companyName/industry/companySize fields), and
          it is mounted here and at /recruiter/profile without being forked.

          What changed: /profile is no longer the recruiter's canonical path. Their profile moved
          to /recruiter/profile to sit with every other /recruiter/* page, so SharedProfileRoute
          forwards organizations off this path before anything else runs. The allowlist below still
          admits organizations on purpose — the wrapper needs them to reach it in order to redirect
          them, and narrowing it to ["seeker"] would have RoleRoute bounce a recruiter to
          /recruiter/overview instead of to their own profile.

          Seekers are untouched by all of this: both tiers, both URL shapes. */}
      <Route element={<RoleRoute allowedRoles={["seeker", "organization"]} />}>
        <Route element={<SharedProfileRoute />}>
          <Route element={<TierCanonical />}>
            <Route element={<AppShell />}>
              {/* Only seekers get this far, so the canonicaliser above does exactly what it does
                  everywhere else: a Pro seeker is moved to /pro/profile, a free seeker is kept on
                  /profile, and neither is a special case any more. */}
              {tierRoutes([["/profile", <ProfilePage />]])}
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Routes shared by seekers and admins. The admin sidebar no longer links here — the
          console nav was replaced with the /admin/* workspace — but admins keep route access so
          these stay reachable by direct URL, from search results and from links elsewhere in the
          product. Narrowing the allowlist is a separate, riskier change and is deliberately not
          bundled with the nav swap. */}
      <Route element={<RoleRoute allowedRoles={["seeker", "SuperAdmin", "Moderator"]} />}>
        <Route element={<TierCanonical />}>
          <Route element={<AppShell />}>
            {/* ADMINS share these three. They are not Pro seekers, so TierCanonical leaves their
                URLs clean and would strip the prefix if one ever appeared. FeedPage's own isPro
                branch (ProSeekerDashboard vs NormalSeekerDashboard) is untouched by any of this —
                which dashboard renders is a page concern, not a routing one. */}
            {tierRoutes([
              ["/home", <FeedPage />],
              ["/jobs", <JobsPage />],
              ["/jobs/:jobId", <JobDetailPage />]
            ])}
          </Route>
        </Route>
      </Route>

      {/* Recruiter-only routes */}
      <Route element={<RoleRoute allowedRoles={["organization"]} />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard/recruiter" element={<RecruiterDashboardPage />} />
          <Route path="/recruiter/overview" element={<RecruiterOverviewPage />} />
          <Route path="/recruiter/job-postings" element={<RecruiterJobPostingsPage />} />
          <Route path="/recruiter/job-postings/new" element={<RecruiterJobFormPage />} />
          <Route path="/recruiter/job-postings/:jobId" element={<RecruiterJobFormPage />} />
          <Route path="/recruiter/candidates" element={<RecruiterCandidatesPage />} />
          <Route path="/recruiter/company-posts" element={<RecruiterCompanyPostsPage />} />
          <Route path="/recruiter/background-check" element={<RecruiterBackgroundCheckPage />} />
          <Route path="/recruiter/integrations" element={<RecruiterIntegrationsPage />} />
          {/* Where the backend lands a recruiter after Google's consent screen. Inside the
              recruiter group like every other /recruiter/* page: the OAuth exchange already
              happened server-side, so by the time this renders the visitor is just a signed-in
              recruiter reading a result. */}
          <Route path="/recruiter/calendar/callback" element={<RecruiterCalendarCallbackPage />} />
          <Route path="/recruiter/messages" element={<RecruiterMessagesPage />} />
          {/* The SAME NotificationsPage component the seeker and admin paths mount — not a copy.
              Its NOTIFICATION_TYPES registry and per-role category chips must stay single-source;
              a RecruiterNotificationsPage.jsx would fork them on day one. */}
          <Route path="/recruiter/notifications" element={<NotificationsPage />} />
          {/* The recruiter's own profile — the SAME ProfilePage the seeker paths mount, not a
              copy. It already branches on session.role internally; a RecruiterProfilePage.jsx
              would fork a component that is currently one. Reached from the header avatar menu
              (AppShell's profilePath), which is a recruiter's only entry point because
              recruiterNavItems has no Profile row. */}
          <Route path="/recruiter/profile" element={<ProfilePage />} />
          <Route path="/recruiter/settings" element={<RecruiterSettingsPage />} />
          <Route path="/recruiter/applications" element={<RecruiterApplicationsPage />} />
          <Route path="/recruiter/applications/:jobId" element={<RecruiterJobApplicantsPage />} />
          <Route path="/recruiter/jobs" element={<RecruiterJobsPage />} />
        </Route>
      </Route>

      {/* Admin-only routes. Every entry in AppShell's adminNavItems resolves here, so no console
          nav link can fall through to NotFoundPage. The console home is /admin/overview, which
          puts it on the same prefix as the other nine console routes and mirrors how the recruiter
          console already names its own home (/recruiter/overview). It was the last page in here
          whose URL did not say which console it belonged to.

          Its two former paths, /dashboard/overview and /dashboard/admin, are both registered as
          redirects in the legacy block far above — not here — because a redirect must not sit
          behind this group's role allowlist. See the comment there. */}
      <Route element={<RoleRoute allowedRoles={["SuperAdmin", "Moderator"]} />}>
        <Route element={<AppShell />}>
          <Route path="/admin/overview" element={<AdminDashboardPage />} />
          <Route path="/admin/candidates" element={<AdminCandidatesPage />} />
          <Route path="/admin/applications" element={<AdminApplicationsPage />} />
          <Route path="/admin/recruiter-pipeline" element={<AdminRecruiterPipelinePage />} />
          <Route path="/admin/skills" element={<AdminSkillsProgressPage />} />
          <Route path="/admin/growth" element={<AdminGrowthOperationsPage />} />
          <Route path="/admin/hrms" element={<AdminHrmsPage />} />
          <Route path="/admin/support" element={<SupportInboxPage />} />
          <Route path="/admin/billing" element={<AdminBillingPage />} />
          <Route path="/admin/api-health" element={<AdminApiHealthPage />} />
        </Route>
      </Route>

      {/* Shared/role-agnostic routes — genuinely meant for more than one role, so they keep the
          plain isAuthenticated-only guard rather than an allowlist. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<TierCanonical />}>
          <Route element={<AppShell />}>
            {/* Any authenticated role reaches these three, which is exactly why the canonicaliser
                tests the role rather than merely "is logged in": only a Pro SEEKER gets /pro here.
                An admin on /connections keeps /connections. */}
            {tierRoutes([
              ["/posts/create", <CreatePostPage />],
              ["/chat", <ChatPage />],
              ["/connections", <ConnectionsPage />]
            ])}
          </Route>
        </Route>

        {/* An organization's public page, not the seeker's own workspace — so it is not tiered and
            stays outside the canonicaliser. /pro/organizations/:id would claim the org belongs to
            the viewer's subscription. */}
        <Route element={<AppShell />}>
          <Route path="/organizations/:id" element={<OrganizationPage />} />
        </Route>
      </Route>

      {/* Pro-Only Routes (seeker Pro-tier gate) */}
      <Route element={<RoleRoute allowedRoles={["seeker"]} />}>
        <Route element={<ProRoute />}>
          <Route element={<AppShell />}>
            <Route path="/pro/automations" element={<AutomationsPage />} />
            <Route path="/pro/linkedin/callback" element={<LinkedInConnectCallbackPage />} />
          </Route>
        </Route>
      </Route>

      {/* /notifications is shared across roles: authenticated, no role allowlist and NO Pro gate.
          It was behind ProRoute, which redirected `seeker && !isPro` to /upgrade — a gate the API
          never had. backend/src/routes/notifications.js is `router.use(requireAuth)` and nothing
          else, so the server already serves every authenticated user their own notifications, and
          AppShell's bell query runs for non-Pro seekers too: they were shown a real unread count
          and then bounced to a paywall when they clicked it. Free seekers genuinely receive most
          of these types (application_status, chat_message, connection_*, post_like, post_comment,
          support_reply, new_job, verification_complete); only auto_apply_success and
          recruiter_introduction_sent are Pro-specific. ProtectedRoute makes the frontend gate
          match the real one.

          This path is LOAD-BEARING for admin sessions and is deliberately not removed now that
          organizations have their own — ProtectedRoute passes admins exactly as ProRoute did. The
          element stays wrapped only so an organization is forwarded to /recruiter/notifications
          (see NotificationsRoute above), which changes nothing for seekers or admins. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<TierCanonical />}>
          <Route element={<AppShell />}>
            {/* /pro/notifications is BACK as a registered path — but note what changed since it
                was collapsed. It is no longer a second mounting under a different rule: both
                shapes are the same NotificationsRoute under this same ProtectedRoute, with no
                ProRoute anywhere near them. The old bug was two URLs with two gates; this is two
                URLs with one gate and a canonicaliser that shows exactly one of them. Admins keep
                the clean path. */}
            {tierRoutes([["/notifications", <NotificationsRoute />]])}
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
