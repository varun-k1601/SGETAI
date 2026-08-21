import { Navigate, Route, Routes } from "react-router-dom";
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

      {/* Seeker-only routes */}
      <Route element={<RoleRoute allowedRoles={["seeker"]} />}>
        <Route element={<AppShell />}>
          {/* Pro Features */}
          <Route path="/pro" element={<Navigate to="/pro/tools" replace />} />
          <Route path="/pro/tools" element={<ProToolsPage />} />
          <Route path="/pro/ai" element={<AIGeneratorPage />} />
          <Route path="/pro/jobs" element={<JobsPage />} />
          <Route path="/pro/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/pro/applied" element={<ApplicationsPage />} />
          <Route path="/pro/learn" element={<LearnPage />} />
          <Route path="/pro/help" element={<HelpPage />} />
          <Route path="/pro/settings" element={<SettingsPage />} />

          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/resume-builder" element={<ResumeBuilderPage />} />
          <Route path="/ats-checker" element={<ResumeAtsCheckerPage />} />
          <Route path="/following" element={<FollowsPage />} />

          {/* Legacy Routes (for backward compatibility) */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Route>

      {/* ProfilePage is shared — it already branches internally on session.role to render either a
          seeker or an organization profile (companyName/industry/companySize fields), so it isn't
          seeker-only like the rest of the /pro group above. */}
      <Route element={<RoleRoute allowedRoles={["seeker", "organization"]} />}>
        <Route element={<AppShell />}>
          <Route path="/pro/profile" element={<ProfilePage />} />
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
            <Route path="/pro/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>
      </Route>

      {/* /notifications is intentionally shared across roles — same ProRoute Pro-tier gate, no
          role allowlist. The admin nav no longer links here, but the route is unchanged and stays
          reachable for admins: ProRoute only redirects seekers who are not Pro, so an admin
          session still passes straight through. This path is LOAD-BEARING for admin sessions and
          is deliberately not removed now that organizations have their own; the element is
          wrapped only so an organization is forwarded to /recruiter/notifications (see
          NotificationsRoute above), which changes nothing for seekers or admins. */}
      <Route element={<ProRoute />}>
        <Route element={<AppShell />}>
          <Route path="/notifications" element={<NotificationsRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
