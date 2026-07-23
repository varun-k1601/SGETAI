import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, ProRoute } from "./ProtectedRoute";
import { AppShell } from "../layouts/AppShell";
import { useAuth } from "../context/AuthContext";
import { getHomePathForRole } from "../utils/roleHome";
import { LoginPage } from "../pages/auth/LoginPage";
import { OAuthCallbackPage } from "../pages/auth/OAuthCallbackPage";
import { OAuthCompleteRecruiterPage } from "../pages/auth/OAuthCompleteRecruiterPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { RecruiterDashboardPage } from "../pages/dashboard/RecruiterDashboardPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
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

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RoleHomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/oauth/complete-recruiter" element={<OAuthCompleteRecruiterPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verification" element={<VerificationSubmitPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {/* Pro Features */}
          <Route path="/pro" element={<Navigate to="/pro/tools" replace />} />
          <Route path="/pro/tools" element={<ProToolsPage />} />
          <Route path="/pro/profile" element={<ProfilePage />} />
          <Route path="/pro/ai" element={<AIGeneratorPage />} />
          <Route path="/pro/jobs" element={<JobsPage />} />
          <Route path="/pro/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/pro/applied" element={<ApplicationsPage />} />
          <Route path="/pro/learn" element={<LearnPage />} />
          <Route path="/pro/help" element={<HelpPage />} />
          <Route path="/pro/settings" element={<SettingsPage />} />

          {/* Other Features */}
          <Route path="/home" element={<FeedPage />} />
          <Route path="/posts/create" element={<CreatePostPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/resume-builder" element={<ResumeBuilderPage />} />
          <Route path="/ats-checker" element={<ResumeAtsCheckerPage />} />
          <Route path="/following" element={<FollowsPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/organizations/:id" element={<OrganizationPage />} />
          <Route
            path="/dashboard/recruiter"
            element={<RecruiterDashboardPage />}
          />
          <Route path="/dashboard/admin" element={<AdminDashboardPage />} />
          <Route path="/recruiter/overview" element={<RecruiterOverviewPage />} />
          <Route path="/recruiter/job-postings" element={<RecruiterJobPostingsPage />} />
          <Route path="/recruiter/job-postings/new" element={<RecruiterJobFormPage />} />
          <Route path="/recruiter/job-postings/:jobId" element={<RecruiterJobFormPage />} />
          <Route path="/recruiter/candidates" element={<RecruiterCandidatesPage />} />
          <Route path="/recruiter/company-posts" element={<RecruiterCompanyPostsPage />} />
          <Route path="/recruiter/background-check" element={<RecruiterBackgroundCheckPage />} />
          <Route path="/recruiter/integrations" element={<RecruiterIntegrationsPage />} />
          <Route path="/recruiter/messages" element={<RecruiterMessagesPage />} />
          <Route path="/recruiter/settings" element={<RecruiterSettingsPage />} />
          <Route path="/recruiter/applications" element={<RecruiterApplicationsPage />} />
          <Route path="/recruiter/applications/:jobId" element={<RecruiterJobApplicantsPage />} />
          <Route path="/recruiter/jobs" element={<RecruiterJobsPage />} />

          {/* Legacy Routes (for backward compatibility) */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Route>

      {/* Pro-Only Routes */}
      <Route element={<ProRoute />}>
        <Route element={<AppShell />}>
          <Route path="/pro/automations" element={<AutomationsPage />} />
          <Route path="/pro/linkedin/callback" element={<LinkedInConnectCallbackPage />} />
          <Route path="/pro/notifications" element={<NotificationsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
