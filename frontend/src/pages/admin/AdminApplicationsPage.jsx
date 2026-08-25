import { useMemo, useState } from "react";
import {
  AdminCard,
  AdminChips,
  AdminConsolePage,
  AdminQueryState,
  AdminTable,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  getPersonName,
  useAdminOverview,
} from "./adminConsoleKit";

const STATUS_FILTERS = ["All", "Pending", "UnderReview", "Interview", "Accepted", "Rejected", "Withdrawn"];

export function AdminApplicationsPage() {
  const { query, overview, metrics } = useAdminOverview();
  const [statusFilter, setStatusFilter] = useState("All");

  const rows = useMemo(() => {
    return (overview.applications || []).filter(
      (application) => statusFilter === "All" || application.status === statusFilter
    );
  }, [overview.applications, statusFilter]);

  // Same partial-data caveat as the candidates directory: the overview endpoint returns only the
  // 12 most recent applications, and the status filter runs client-side over that slice. The
  // label therefore never claims anything about applications it has not loaded.
  const loadedCount = (overview.applications || []).length;
  const totalCount = metrics.applications ?? loadedCount;
  const scope =
    totalCount > loadedCount
      ? `the ${formatNumber(loadedCount)} most recent applications (${formatNumber(totalCount)} exist in total)`
      : `${formatNumber(totalCount)} applications`;
  const emptyLabel =
    statusFilter === "All"
      ? "No applications recorded yet."
      : `No "${statusFilter}" applications among ${scope}.`;

  return (
    <AdminConsolePage
      eyebrow="Pipeline"
      title="Applications"
      description="Platform-wide application volume and the most recent submissions."
    >
      <section className="admin-console__section">
        <AdminChips
          items={[
            { label: "total", value: formatNumber(metrics.applications) },
            { label: "pending", value: formatNumber(metrics.pendingApplications) },
            { label: "under review", value: formatNumber(metrics.underReviewApplications) },
            { label: "accepted", value: formatNumber(metrics.acceptedApplications) },
            { label: "rejected", value: formatNumber(metrics.rejectedApplications) },
            { label: "withdrawn", value: formatNumber(metrics.withdrawnApplications) },
          ]}
        />
      </section>

      <section className="admin-console__section">
        <AdminCard
          eyebrow="Verification"
          title="Employment verification"
          action={<span className="adm-note">Across all applications</span>}
        >
          <AdminChips
            items={[
              { label: "verified", value: formatNumber(metrics.verificationVerified) },
              { label: "in progress", value: formatNumber(metrics.verificationInProgress) },
              { label: "awaiting manager", value: formatNumber(metrics.verificationPending) },
            ]}
          />
        </AdminCard>
      </section>

      <section className="admin-console__section">
        <AdminCard
          eyebrow="Latest"
          title="Recent applications"
          action={
            <select
              className="adm-control"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter applications by status"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All statuses" : status}
                </option>
              ))}
            </select>
          }
        >
          <AdminQueryState query={query} isEmpty={!rows.length} emptyLabel={emptyLabel}>
            <AdminTable
              caption="Most recent applications across the platform"
              columns={["Role", "Candidate", "Company", "Status", "ATS", "Source", "Submitted"]}
            >
              {rows.map((application) => (
                <tr key={application._id}>
                  <td>{application.jobId?.title || <span className="adm-dash">—</span>}</td>
                  <td>
                    <span className="adm-candidate__name">
                      {getPersonName(application.jobSeekerId)}
                    </span>
                    <span className="adm-candidate__meta">
                      {application.jobSeekerId?.isPro ? "Pro" : "Standard"}
                    </span>
                  </td>
                  <td>
                    {application.organizationId?.companyName || <span className="adm-dash">—</span>}
                  </td>
                  <td>
                    <StatusPill status={application.status} />
                  </td>
                  <td>
                    {Number.isFinite(application.atsScore) ? (
                      <span className="adm-match">{application.atsScore}%</span>
                    ) : (
                      <span className="adm-dash">—</span>
                    )}
                  </td>
                  <td>
                    <span className="adm-candidate__meta">{application.source || "—"}</span>
                  </td>
                  <td>
                    <span className="adm-num adm-candidate__meta">
                      {formatRelativeTime(application.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </AdminQueryState>
        </AdminCard>
      </section>
    </AdminConsolePage>
  );
}
