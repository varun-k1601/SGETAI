import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { ProtectedRoute, ProRoute, RoleRoute } from "./ProtectedRoute";
import { AppShell } from "../layouts/AppShell";
import { useAuth } from "../context/AuthContext";
import { getHomePathForRole } from "../utils/roleHome";
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
import { RecruiterMessagesPage } from "../pages/recruiter/RecruiterMessagesPage";
import { RecruiterSettingsPage } from "../pages/recruiter/RecruiterSettingsPage";
import { NotFoundPage } from "../pages/NotFoundPage";

function RoleHomeRedirect() {
  const { session } = useAuth();
  return <Navigate to={getHomePathForRole(session?.role)} replace />;
}

/* ===============================================================================================
   LEGACY PATH REDIRECT — the /pro/* prefix was a NAMING ARTIFACT, never a gate.
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
        <Route path="/pro" element={<LegacyRedirect to="/tools" />} />
        <Route path="/pro/tools" element={<LegacyRedirect to="/tools" />} />
        <Route path="/pro/profile" element={<LegacyRedirect to="/profile" />} />
        <Route path="/pro/ai" element={<LegacyRedirect to="/ai" />} />
        <Route path="/pro/jobs" element={<LegacyRedirect to="/jobs" />} />
        <Route path="/pro/jobs/:jobId" element={<LegacyRedirect to="/jobs/:jobId" />} />
        <Route path="/pro/applied" element={<LegacyRedirect to="/applied" />} />
        <Route path="/pro/learn" element={<LegacyRedirect to="/learn" />} />
        <Route path="/pro/help" element={<LegacyRedirect to="/help" />} />
        <Route path="/pro/settings" element={<LegacyRedirect to="/settings" />} />
        {/* Notifications are NOT Pro-gated — see the /notifications block below. This path used to
            mount NotificationsPage a second time behind RoleRoute + ProRoute, which meant one page
            reachable at two URLs under different rules; that split is how the paywalled-bell bug
            survived. One page, one canonical URL, and this redirect keeps existing links alive. */}
        <Route path="/pro/notifications" element={<LegacyRedirect to="/notifications" />} />
        {/* Pre-dates the /pro group; /applied is canonical because it is the label the nav uses
            ("Applied Jobs") and the path the brief names. */}
        <Route path="/applications" element={<LegacyRedirect to="/applied" />} />
      </Route>

      {/* Seeker-only routes, on canonical paths. Nothing in this group is Pro-gated — that is the
          whole point: a free seeker reaches every one of them, so none may claim "pro" in its URL.
          Pro-only routes live in their own group at the bottom of this file. */}
      <Route element={<RoleRoute allowedRoles={["seeker"]} />}>
        <Route element={<AppShell />}>
          <Route path="/tools" element={<ProToolsPage />} />
          <Route path="/ai" element={<AIGeneratorPage />} />
          <Route path="/applied" element={<ApplicationsPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/resume-builder" element={<ResumeBuilderPage />} />
          <Route path="/ats-checker" element={<ResumeAtsCheckerPage />} />
          <Route path="/following" element={<FollowsPage />} />
        </Route>
      </Route>

      {/* ProfilePage is shared — it already branches internally on session.role to render either a
          seeker or an organization profile (companyName/industry/companySize fields), so it is not
          seeker-only. /profile MOVED here from the seeker-only group above when it became the
          canonical path: it is now the recruiter's own profile page too, which /pro/profile used
          to be, so narrowing it to seekers would have broken that. */}
      <Route element={<RoleRoute allowedRoles={["seeker", "organization"]} />}>
        <Route element={<AppShell />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Routes shared by seekers and admins. The admin sidebar no longer links here — the
          console nav was replaced with the /admin/* workspace — but admins keep route access so
          these stay reachable by direct URL, from search results and from links elsewhere in the
          product. Narrowing the allowlist is a separate, riskier change and is deliberately not
          bundled with the nav swap. */}
      <Route element={<RoleRoute allowedRoles={["seeker", "SuperAdmin", "Moderator"]} />}>
        <Route element={<AppShell />}>
          <Route path="/home" element={<FeedPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
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
          <Route path="/recruiter/messages" element={<RecruiterMessagesPage />} />
          {/* The SAME NotificationsPage component the seeker and admin paths mount — not a copy.
              Its NOTIFICATION_TYPES registry and per-role category chips must stay single-source;
              a RecruiterNotificationsPage.jsx would fork them on day one. */}
          <Route path="/recruiter/notifications" element={<NotificationsPage />} />
          <Route path="/recruiter/settings" element={<RecruiterSettingsPage />} />
          <Route path="/recruiter/applications" element={<RecruiterApplicationsPage />} />
          <Route path="/recruiter/applications/:jobId" element={<RecruiterJobApplicantsPage />} />
          <Route path="/recruiter/jobs" element={<RecruiterJobsPage />} />
        </Route>
      </Route>

      {/* Admin-only routes. Every entry in AppShell's adminNavItems resolves here, so no console
          nav link can fall through to NotFoundPage. The console home is /dashboard/overview, so
          the URL matches the nav label; the old /dashboard/admin path is kept as a redirect so
          existing bookmarks and any links already in the wild still land on a real page rather
          than NotFoundPage. Everything added since uses the /admin/* prefix. */}
      <Route element={<RoleRoute allowedRoles={["SuperAdmin", "Moderator"]} />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard/overview" element={<AdminDashboardPage />} />
          {/* Legacy path, superseded by /dashboard/overview above. Kept indefinitely: it was the
              admin home for the whole life of the product so far. */}
          <Route path="/dashboard/admin" element={<Navigate to="/dashboard/overview" replace />} />
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
        <Route element={<AppShell />}>
          <Route path="/posts/create" element={<CreatePostPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
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
        <Route element={<AppShell />}>
          <Route path="/notifications" element={<NotificationsRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
