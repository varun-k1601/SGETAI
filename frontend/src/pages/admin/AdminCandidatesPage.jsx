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
  getInitials,
  getPersonName,
  useAdminOverview,
} from "./adminConsoleKit";

export function AdminCandidatesPage() {
  const { query, overview, metrics } = useAdminOverview();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const signals = overview.candidateSignals || {};

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (overview.seekers || [])
      .map((seeker) => {
        const signal = signals[seeker._id] || {};
        const name = getPersonName(seeker);

        return {
          id: seeker._id,
          name,
          initials: getInitials(name),
          // JobSeeker carries no location field, so the secondary line uses the handle and the
          // real plan tier rather than inventing a market.
          meta: `@${seeker.username || "not-set"} · ${seeker.isPro ? "Pro" : "Standard"}`,
          email: seeker.email,
          isPro: Boolean(seeker.isPro),
          currentStatus: seeker.currentStatus || null,
          openToWork: Boolean(seeker.openToWork),
          targetRole: signal.targetRole || null,
          matchScore: signal.matchScore ?? null,
          pipelineStatus: signal.pipelineStatus || null,
          totalApplications: signal.totalApplications || 0,
          lastActivityAt: signal.lastActivityAt || seeker.createdAt || null,
        };
      })
      .filter((row) => {
        if (planFilter === "pro" && !row.isPro) return false;
        if (planFilter === "standard" && row.isPro) return false;
        if (!needle) return true;

        return (
          row.name.toLowerCase().includes(needle) ||
          row.meta.toLowerCase().includes(needle) ||
          (row.email || "").toLowerCase().includes(needle) ||
          (row.targetRole || "").toLowerCase().includes(needle)
        );
      });
  }, [overview.seekers, signals, search, planFilter]);

  // What is actually on this page versus what exists on the platform. The overview endpoint
  // returns only the newest 10 seekers, and the search/plan filters below run CLIENT-SIDE over
  // that slice — so an empty result means "no match in these 10", never "no such candidate".
  const loadedCount = (overview.seekers || []).length;
  const totalCount = metrics.seekers ?? loadedCount;
  const isPartial = totalCount > loadedCount;

  // The old label was "No candidates match this search." — which, over a partial list, asserts
  // something the page cannot know. Searching for the 11th candidate would have confidently
  // reported that they do not exist. This says exactly what was searched.
  const scope = isPartial
    ? `the ${formatNumber(loadedCount)} most recent candidates (${formatNumber(totalCount)} exist in total)`
    : `${formatNumber(totalCount)} candidates`;
  const emptyLabel =
    planFilter === "all"
      ? `No match among ${scope}.`
      : `No ${planFilter === "pro" ? "Pro" : "standard"} accounts among ${scope}.`;

  return (
    <AdminConsolePage
      eyebrow="People"
      title="Candidates"
      description="The most recent sign-ups, joined to the latest application each one submitted."
    >
      <section className="admin-console__section">
        <AdminChips
          items={[
            { label: "total candidates", value: formatNumber(metrics.seekers) },
            { label: "Pro", value: formatNumber(metrics.proSeekers) },
            { label: "standard", value: formatNumber(metrics.normalSeekers) },
            { label: "shown here", value: formatNumber((overview.seekers || []).length) },
          ]}
        />
      </section>

      <section className="admin-console__section">
        <AdminCard
          eyebrow="Directory"
          title="Recent candidates"
          action={
            <span className="adm-note">
              Newest <span className="adm-num">{formatNumber((overview.seekers || []).length)}</span>
            </span>
          }
        >
          <div className="adm-filters">
            <label className="sr-only" htmlFor="admin-candidates-search">
              Search candidates by name, handle, email or target role
            </label>
            <input
              id="admin-candidates-search"
              className="adm-search"
              type="search"
              placeholder="Search candidates…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="adm-control"
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value)}
              aria-label="Filter candidates by plan"
            >
              <option value="all">All plans</option>
              <option value="pro">Pro only</option>
              <option value="standard">Standard only</option>
            </select>
          </div>

          <AdminQueryState query={query} isEmpty={!rows.length} emptyLabel={emptyLabel}>
            <AdminTable
              caption="Recent candidates and their latest application signals"
              columns={["Candidate", "Status", "Target role", "Match", "Pipeline", "Apps", "Last activity"]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="adm-candidate">
                      <span className="adm-avatar" aria-hidden="true">
                        {row.initials}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="adm-candidate__name">{row.name}</span>
                        <span className="adm-candidate__meta">{row.meta}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="adm-candidate__meta">
                      {row.currentStatus || "—"}
                      {row.openToWork ? " · open to work" : ""}
                    </span>
                  </td>
                  <td>{row.targetRole || <span className="adm-dash">—</span>}</td>
                  <td>
                    {row.matchScore === null ? (
                      <span className="adm-dash">—</span>
                    ) : (
                      <span className="adm-match">{row.matchScore}%</span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={row.pipelineStatus} />
                  </td>
                  <td>
                    <span className="adm-num">{row.totalApplications}</span>
                  </td>
                  <td>
                    <span className="adm-num adm-candidate__meta">
                      {formatRelativeTime(row.lastActivityAt)}
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
