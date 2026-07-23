import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { MetricCard } from "../../components/MetricCard";
import { JobPostingCard } from "../../components/JobPostingCard";
import { ApplicantPipelineChart } from "../../components/ApplicantPipelineChart";
import { CandidateCard } from "../../components/CandidateCard";
import { RecruiterAnalyticsWidget } from "../../components/RecruiterAnalyticsWidget";
import { mockRecruiterDashboard } from "../../services/mockData";

export function RecruiterDashboardPage() {
  const { session } = useAuth();

  if (session?.role !== "organization") {
    return (
      <section className="info-card">
        <h3>Recruiter dashboard unavailable</h3>
        <p>This workspace is only available for recruiter accounts.</p>
      </section>
    );
  }

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", "recruiter"],
    queryFn: () => apiRequest("/dashboard/recruiter", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60 * 1000,
  });

  // Use mock data as fallback
  const dashboardData = dashboardQuery.data?.dashboard || mockRecruiterDashboard;

  const handleJobEdit = (jobId) => {
    console.log("Edit job:", jobId);
  };

  const handleJobClose = (jobId) => {
    console.log("Close job:", jobId);
  };

  const handleJobView = (jobId) => {
    console.log("View job:", jobId);
  };

  const handleReviewCandidate = (candidateId) => {
    console.log("Review candidate:", candidateId);
  };

  const handleContactCandidate = (candidateId) => {
    console.log("Contact candidate:", candidateId);
  };

  const analytics = dashboardData.analytics || {};

  return (
    <section className="dashboard-stack">
      {/* Command Center Header Section */}
      <section className="command-center-header">
        <div className="command-center-content">
          <span className="command-center-label">RECRUITER COMMAND CENTER</span>
          <h1>Welcome back, Hiring Team</h1>
          <p>AI ranked {analytics.totalApplications || 482} new applicants this week. {dashboardData.applicantPipeline?.interviewed || 3} background checks are ready for review.</p>
        </div>
        <Link to="/recruiter/jobs/new" className="button button--primary">
          + Post a job
        </Link>
      </section>

      {/* Top Metrics Section */}
      <section className="stats-grid recruiter-metrics">
        <MetricCard
          label="Active postings"
          value={dashboardData.postedJobs?.filter(j => j.status === "active").length || 0}
          trend="+2 this wk"
        />
        <MetricCard
          label="New applicants"
          value={dashboardData.applicantPipeline?.totalApplications || 0}
          trend="+38%"
        />
        <MetricCard
          label="Profile views"
          value={analytics.totalJobViews || 0}
          trend="+12%"
        />
        <MetricCard
          label="Avg match"
          value={`${analytics.averageMatchQuality || 0}%`}
        />
      </section>

      {/* Pipeline Section */}
      {dashboardData.applicantPipeline && (
        <section className="pipeline-section">
          <div className="section-header">
            <span className="section-label">PIPELINE</span>
            <h2>Hiring funnel</h2>
            <span className="pipeline-timeframe">Last 30 days</span>
          </div>
          <div className="pipeline-chart-container">
            <ApplicantPipelineChart pipeline={dashboardData.applicantPipeline} />
          </div>
        </section>
      )}

      {/* Bottom Grid: Candidates + Services + ATS */}
      <div className="recruiter-bottom-grid">
        {/* Top Candidates Section */}
        <section className="top-candidates-section">
          <div className="section-header">
            <span className="section-label">AI-RANKED</span>
            <h2>Top candidates this week</h2>
            <Link to="/recruiter/applicants" className="text-link">
              See all →
            </Link>
          </div>
          <div className="candidates-list">
            {dashboardData.recentApplicants?.slice(0, 5).map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onReview={handleReviewCandidate}
                onContact={handleContactCandidate}
              />
            ))}
          </div>
        </section>

        {/* Free Service: Background Checks */}
        <section className="free-service-section">
          <div className="service-header">
            <span className="service-label">FREE SERVICE</span>
            <h3>Background checks</h3>
          </div>
          <div className="checks-list">
            {dashboardData.recentApplicants?.slice(0, 3).map((candidate) => (
              <div key={candidate.id} className="check-item">
                <div className="check-avatar">{candidate.name.charAt(0)}</div>
                <div className="check-info">
                  <div className="check-name">{candidate.name}</div>
                  <div className="check-status">{candidate.status === 'accepted' ? 'Completed' : 'In-Progress'}</div>
                </div>
                <div className="check-progress">
                  {candidate.status === 'accepted' ? (
                    <span className="check-badge">Completed</span>
                  ) : (
                    <span className="check-badge in-progress">In-Progress</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="text-link">+ New background check</button>
        </section>

        {/* ATS & HRIS Section */}
        <section className="ats-integration-section">
          <div className="integration-header">
            <span className="integration-label">CONNECT</span>
            <h3>ATS & HRIS</h3>
          </div>
          <p className="integration-description">Connect your existing ATS or HRIS system for seamless applicant management.</p>
          <div className="integration-icon">🔗</div>
        </section>
      </div>

      {/* Analytics Widget - if you want it visible */}
      {dashboardData.analytics && (
        <RecruiterAnalyticsWidget analytics={dashboardData.analytics} />
      )}
    </section>
  );
}
