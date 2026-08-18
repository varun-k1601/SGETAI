import {
  AdminCard,
  AdminChips,
  AdminConsolePage,
  AdminQueryState,
  AdminTable,
  formatNumber,
  useAdminOverview,
} from "./adminConsoleKit";

function DeltaCell({ delta }) {
  if (!delta || delta.changePercent === null || delta.changePercent === undefined) {
    return <span className="adm-delta adm-delta--flat">NO BASELINE</span>;
  }

  const tone =
    delta.changePercent > 0
      ? "adm-delta--up"
      : delta.changePercent < 0
        ? "adm-delta--down"
        : "adm-delta--flat";
  const arrow = delta.changePercent > 0 ? "▲" : delta.changePercent < 0 ? "▼" : "•";

  return (
    <span className={`adm-delta ${tone}`}>
      {arrow} {delta.changePercent > 0 ? "+" : ""}
      {delta.changePercent}%
    </span>
  );
}

const DELTA_ROWS = [
  ["Candidate sign-ups", "seekers"],
  ["Applications", "applications"],
  ["Jobs posted", "jobs"],
  ["Payments received", "paidPayments"],
];

export function AdminGrowthOperationsPage() {
  const { query, trends, metrics } = useAdminOverview();

  const windowDays = trends.window?.days ?? 30;
  const deltas = trends.deltas || {};
  const funnel = trends.funnelWeekly || [];
  const totalFunnelApplications = funnel.reduce((sum, week) => sum + (week.applications || 0), 0);
  const totalFunnelAccepted = funnel.reduce((sum, week) => sum + (week.accepted || 0), 0);

  return (
    <AdminConsolePage
      eyebrow="Operations"
      title="Growth & operations"
      description={`Movement across the platform over the trailing ${windowDays} days, against the ${windowDays} days before it.`}
    >
      <section className="admin-console__section">
        <AdminCard eyebrow={`Last ${windowDays} days`} title="Period over period">
          <AdminQueryState query={query} isEmpty={false} />
          <AdminTable
            caption="Counts for the current window against the previous window of equal length"
            columns={["Metric", "This period", "Previous", "Change"]}
          >
            {DELTA_ROWS.map(([label, key]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <span className="adm-num">{formatNumber(deltas[key]?.current)}</span>
                </td>
                <td>
                  <span className="adm-num adm-candidate__meta">
                    {formatNumber(deltas[key]?.previous)}
                  </span>
                </td>
                <td>
                  <DeltaCell delta={deltas[key]} />
                </td>
              </tr>
            ))}
          </AdminTable>
        </AdminCard>
      </section>

      <section className="admin-console__section adm-row">
        <AdminCard eyebrow="Funnel" title={`Weekly buckets, last ${funnel.length} weeks`}>
          <AdminQueryState
            query={query}
            isEmpty={!funnel.length}
            emptyLabel="No application history in this period."
          />
          {funnel.length ? (
            <>
              <AdminChips
                items={[
                  { label: "applications", value: formatNumber(totalFunnelApplications) },
                  { label: "accepted", value: formatNumber(totalFunnelAccepted) },
                  {
                    label: "overall conversion",
                    value: totalFunnelApplications
                      ? `${Math.round((totalFunnelAccepted / totalFunnelApplications) * 1000) / 10}%`
                      : "—",
                  },
                ]}
              />
              <AdminTable
                caption="Applications and acceptances per week"
                columns={["Week beginning", "Applications", "Accepted", "Conversion"]}
              >
                {funnel.map((week) => (
                  <tr key={week.weekStart}>
                    <td>
                      <span className="adm-num">
                        {new Intl.DateTimeFormat("en-GB", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(week.weekStart))}
                      </span>
                    </td>
                    <td>
                      <span className="adm-num">{formatNumber(week.applications)}</span>
                    </td>
                    <td>
                      <span className="adm-num">{formatNumber(week.accepted)}</span>
                    </td>
                    <td>
                      <span className="adm-num">{week.conversionRate}%</span>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </>
          ) : null}
        </AdminCard>

        <AdminCard eyebrow="Ledger" title="Everything on record">
          <AdminChips
            items={[
              { label: "candidates", value: formatNumber(metrics.seekers) },
              { label: "Pro", value: formatNumber(metrics.proSeekers) },
              { label: "organisations", value: formatNumber(metrics.recruiters) },
              { label: "jobs", value: formatNumber(metrics.jobs) },
              { label: "applications", value: formatNumber(metrics.applications) },
              { label: "posts", value: formatNumber(metrics.posts) },
              { label: "connections", value: formatNumber(metrics.connections) },
              { label: "payments", value: formatNumber(metrics.payments) },
            ]}
          />
        </AdminCard>
      </section>
    </AdminConsolePage>
  );
}
