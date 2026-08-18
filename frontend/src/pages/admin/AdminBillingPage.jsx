import {
  AdminCard,
  AdminChips,
  AdminConsolePage,
  AdminQueryState,
  AdminTable,
  StatusPill,
  formatDateTime,
  formatMoney,
  formatNumber,
  getPersonName,
  useAdminOverview,
} from "./adminConsoleKit";

export function AdminBillingPage() {
  const { query, overview, metrics, trends } = useAdminOverview();

  const payments = overview.payments || [];
  const mrr = trends.mrr || {};
  const revenueByCurrency = Object.entries(metrics.revenueByCurrency || {});

  return (
    <AdminConsolePage
      eyebrow="Revenue"
      title="Billing"
      description="Subscription payments, recurring revenue, and the most recent transactions."
    >
      <section className="admin-console__section adm-row">
        <AdminCard eyebrow="Recurring" title="Monthly recurring revenue">
          <AdminQueryState query={query} isEmpty={false} />
          {mrr.primary ? (
            <>
              <div className="adm-kpi__value adm-num" style={{ marginBottom: 10 }}>
                {formatMoney(mrr.primary.currency, mrr.primary.amount)}
              </div>
              <p className="adm-kpi__helper" style={{ marginBottom: 14 }}>
                {formatNumber(mrr.activeSubscriptions)} unexpired paid subscriptions. Yearly plans
                contribute one twelfth of their amount; currencies are never summed together.
              </p>
              <AdminChips
                items={(mrr.byCurrency || []).map((row) => ({
                  label: `${row.currency} · ${formatNumber(row.activeSubscriptions)} active`,
                  value: formatNumber(row.amount),
                }))}
              />
            </>
          ) : (
            <p className="adm-empty">No unexpired paid subscriptions.</p>
          )}
        </AdminCard>

        <AdminCard eyebrow="All time" title="Collected revenue">
          <AdminChips
            items={[
              { label: "payment records", value: formatNumber(metrics.payments) },
              { label: "paid", value: formatNumber(metrics.paidPayments) },
            ]}
          />
          {revenueByCurrency.length ? (
            <div style={{ marginTop: 12 }}>
              <AdminChips
                items={revenueByCurrency.map(([currency, amount]) => ({
                  label: `${currency} collected`,
                  value: formatNumber(amount),
                }))}
              />
            </div>
          ) : (
            <p className="adm-empty">No paid revenue recorded yet.</p>
          )}
        </AdminCard>
      </section>

      <section className="admin-console__section">
        <AdminCard
          eyebrow="Ledger"
          title="Recent transactions"
          action={<span className="adm-note">Newest {formatNumber(payments.length)}</span>}
        >
          <AdminQueryState
            query={query}
            isEmpty={!payments.length}
            emptyLabel="No payments have been recorded yet."
          />
          {payments.length ? (
            <AdminTable
              caption="Most recent subscription payments"
              columns={["Customer", "Plan", "Amount", "Provider", "Status", "Paid", "Expires"]}
            >
              {payments.map((payment) => (
                <tr key={payment._id}>
                  <td>
                    <span className="adm-candidate__name">{getPersonName(payment.seekerId)}</span>
                    <span className="adm-candidate__meta">
                      {payment.seekerId?.email || "no email on record"}
                    </span>
                  </td>
                  <td>
                    <span className="adm-candidate__meta">{payment.plan}</span>
                  </td>
                  <td>
                    <span className="adm-num">
                      {formatMoney(payment.currency, payment.amount)}
                    </span>
                  </td>
                  <td>
                    <span className="adm-candidate__meta">{payment.provider}</span>
                  </td>
                  <td>
                    <StatusPill status={payment.status} />
                  </td>
                  <td>
                    <span className="adm-num adm-candidate__meta">
                      {formatDateTime(payment.paidAt)}
                    </span>
                  </td>
                  <td>
                    <span className="adm-num adm-candidate__meta">
                      {formatDateTime(payment.expiresAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : null}
        </AdminCard>
      </section>
    </AdminConsolePage>
  );
}
