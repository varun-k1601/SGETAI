import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

// Shared scaffolding for the admin console sub-pages. AdminDashboardPage keeps its own local
// copies of the equivalent helpers on purpose — it is a working, verified page and rewiring its
// internals is a separate change from adding these nine routes.

// Same key the dashboard uses for its default range, so navigating between console pages reuses
// one cached payload instead of refetching the same document per page.
const OVERVIEW_QUERY_KEY = ["admin-overview", 30];

export function useAdminOverview() {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: OVERVIEW_QUERY_KEY,
    queryFn: () =>
      apiRequest("/admin/overview?windowDays=30", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  return {
    query,
    overview: query.data || {},
    metrics: query.data?.metrics || {},
    trends: query.data?.trends || {},
  };
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

export function formatMoney(currency, amount) {
  return `${currency || "INR"} ${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function formatDateTime(value) {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function formatRelativeTime(value) {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    return "—";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays < 30 ? `${diffDays}d ago` : `${Math.floor(diffDays / 30)}mo ago`;
}

export function getPersonName(user) {
  return (
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.companyName ||
    user?.email ||
    "Unknown"
  );
}

export function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "?";
}

const PILL_TONE = {
  Accepted: "adm-pill--pos",
  Verified: "adm-pill--pos",
  Paid: "adm-pill--pos",
  Active: "adm-pill--pos",
  Interview: "adm-pill--info",
  Reviewed: "adm-pill--info",
  InProgress: "adm-pill--info",
  UnderReview: "adm-pill--warn",
  Pending: "adm-pill--warn",
  New: "adm-pill--warn",
  OnHold: "adm-pill--warn",
  Created: "adm-pill--warn",
  Rejected: "adm-pill--neg",
  Failed: "adm-pill--neg",
  Closed: "adm-pill--neg",
};

const PILL_LABEL = {
  UnderReview: "Under review",
  InProgress: "In progress",
  OnHold: "On hold",
};

// The pill always carries a readable text label, so state is never signalled by colour alone.
export function StatusPill({ status }) {
  if (!status) {
    return <span className="adm-dash">—</span>;
  }

  return (
    <span className={`adm-pill ${PILL_TONE[status] || ""}`.trim()}>
      {PILL_LABEL[status] || status}
    </span>
  );
}

export function AdminConsolePage({ eyebrow, title, description, actions, children }) {
  return (
    <div className="admin-console">
      <div className="admin-console__inner">
        <header className="admin-console__section adm-header">
          <div>
            <p className="adm-eyebrow">{eyebrow}</p>
            <h1 className="adm-h1">{title}</h1>
            {description ? <p className="adm-sub">{description}</p> : null}
          </div>
          {actions ? <div className="adm-header__actions">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function AdminCard({ eyebrow, title, action, children }) {
  return (
    <article className="adm-card">
      {eyebrow || title || action ? (
        <div className="adm-card__head">
          <div>
            {eyebrow ? <p className="adm-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="adm-card__title">{title}</h2> : null}
          </div>
          {action || null}
        </div>
      ) : null}
      {children}
    </article>
  );
}

export function AdminChips({ items }) {
  return (
    <div className="adm-chips">
      {items.map((item) => (
        <span className="adm-chip" key={item.label}>
          <strong>{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  );
}

export function AdminTable({ columns, children, caption }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* Renders the loading / error / empty branch, or the content when there is nothing to report.
 *
 * The children API exists to make one specific bug UNREPRESENTABLE. Two pages had written:
 *
 *     const state = <AdminQueryState … />;      // a React ELEMENT
 *     {state || <AdminTable …>{rows}</AdminTable>}
 *
 * A React element is an object, so it is ALWAYS truthy no matter what the component returns when
 * React later renders it. `||` therefore always took the left branch and the table was unreachable
 * dead code — on a healthy load with rows present the page rendered this function's `null` where
 * the table should have been, and not even the empty message, because nothing was empty.
 *
 * Passing the content as children removes the boolean from the call site entirely, so there is no
 * longer anything to get wrong. `children ?? null` keeps the older childless usages working
 * unchanged: AdminApiHealthPage, AdminBillingPage, AdminGrowthOperationsPage and
 * AdminRecruiterPipelinePage all render this self-closing with their table as a SIBLING guarded by
 * its own `x.length ? … : null`, which was never affected by the bug.
 */
export function AdminQueryState({ query, emptyLabel, isEmpty, children }) {
  if (query.isLoading) {
    return <p className="adm-empty">Loading…</p>;
  }

  if (query.isError) {
    return <p className="feedback-banner error">{query.error?.message || "Request failed."}</p>;
  }

  if (isEmpty) {
    return <p className="adm-empty">{emptyLabel}</p>;
  }

  return children ?? null;
}

// Used by the two console pages whose data does not exist anywhere on the platform yet. It states
// that plainly rather than rendering zeroes or sample rows, which would read as real measurements
// of an empty system.
export function AdminNotAvailable({ what, why, needs }) {
  return (
    <AdminCard>
      <div className="adm-unavailable">
        <span className="adm-unavailable__badge">Not yet available</span>
        <h2 className="adm-card__title">{what}</h2>
        <p className="adm-kpi__helper">{why}</p>
        {needs?.length ? (
          <>
            <p className="adm-eyebrow adm-unavailable__needs-label">Would require</p>
            <ul className="adm-unavailable__list">
              {needs.map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </AdminCard>
  );
}
