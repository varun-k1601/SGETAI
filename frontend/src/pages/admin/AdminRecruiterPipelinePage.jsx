import {
  AdminCard,
  AdminChips,
  AdminConsolePage,
  AdminQueryState,
  AdminTable,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  useAdminOverview,
} from "./adminConsoleKit";

export function AdminRecruiterPipelinePage() {
  const { query, overview, metrics } = useAdminOverview();

  const recruiters = overview.recruiters || [];
  const jobs = overview.jobs || [];

  return (
    <AdminConsolePage
      eyebrow="Supply side"
      title="Recruiter pipeline"
      description="Organisations joining the platform, their verification state, and what they are posting."
    >
      <section className="admin-console__section">
        <AdminChips
          items={[
            { label: "organisations", value: formatNumber(metrics.recruiters) },
            { label: "verified", value: formatNumber(metrics.verifiedRecruiters) },
            { label: "pending review", value: formatNumber(metrics.pendingRecruiters) },
            { label: "on hold", value: formatNumber(metrics.onHoldRecruiters) },
            { label: "active jobs", value: formatNumber(metrics.activeJobs) },
            { label: "closed jobs", value: formatNumber(metrics.closedJobs) },
          ]}
        />
      </section>

      <section className="admin-console__section adm-row">
        <AdminCard
          eyebrow="Onboarding"
          title="Recent organisations"
          action={<span className="adm-note">Newest {formatNumber(recruiters.length)}</span>}
        >
          <AdminQueryState
            query={query}
            isEmpty={!recruiters.length}
            emptyLabel="No organisations have registered yet."
          />
          {recruiters.length ? (
            <AdminTable
              caption="Most recently registered organisations"
              columns={["Organisation", "Industry", "Verification", "Domain", "Joined"]}
            >
              {recruiters.map((recruiter) => (
                <tr key={recruiter._id}>
                  <td>
                    <span className="adm-candidate__name">{recruiter.companyName || "Unknown"}</span>
                    <span className="adm-candidate__meta">
                      @{recruiter.username || "not-set"} · {recruiter.email}
                    </span>
                  </td>
                  <td>
                    <span className="adm-candidate__meta">{recruiter.industry || "—"}</span>
                  </td>
                  <td>
                    <StatusPill status={recruiter.verificationStatus} />
                  </td>
                  <td>
                    <span className="adm-candidate__meta">
                      {recruiter.domainMatched ? "Matched" : "Unmatched"}
                    </span>
                  </td>
                  <td>
                    <span className="adm-num adm-candidate__meta">
                      {formatRelativeTime(recruiter.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : null}
        </AdminCard>

        <AdminCard
          eyebrow="Demand"
          title="Latest postings"
          action={<span className="adm-note">Newest {formatNumber(jobs.length)}</span>}
        >
          <AdminQueryState query={query} isEmpty={!jobs.length} emptyLabel="No jobs posted yet." />
          {jobs.length ? (
            <ol className="adm-pulse">
              {jobs.map((job) => (
                <li className="adm-pulse__item" key={job._id}>
                  <span
                    className={`adm-pulse__dot ${
                      job.status === "Active" ? "adm-pulse__dot--job" : ""
                    }`.trim()}
                    aria-hidden="true"
                  />
                  <span className="adm-pulse__title">{job.title}</span>
                  <p className="adm-pulse__desc">
                    {job.organizationId?.companyName || "Unknown company"}
                    {job.location ? ` · ${job.location}` : ""}
                    {job.type ? ` · ${job.type}` : ""} · {job.status}
                  </p>
                  <span className="adm-pulse__time">{formatRelativeTime(job.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </AdminCard>
      </section>
    </AdminConsolePage>
  );
}
