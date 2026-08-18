import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import {
  AdminCard,
  AdminConsolePage,
  AdminQueryState,
  AdminTable,
  formatDateTime,
} from "./adminConsoleKit";

// The health endpoint reports free-form strings per service. These map the known values onto a
// tone; anything unrecognised falls through to the neutral pill rather than being guessed at.
const SERVICE_TONE = {
  connected: "adm-pill--pos",
  configured: "adm-pill--pos",
  disconnected: "adm-pill--neg",
  fallback: "adm-pill--warn",
  "dev-fallback": "adm-pill--warn",
};

const SERVICE_LABEL = {
  database: "Database",
  ai: "AI (Gemini)",
  email: "Email delivery",
  supabase: "Supabase storage",
};

const SERVICE_DETAIL = {
  database: "MongoDB connection state as reported by the live mongoose connection.",
  ai: 'Reads "fallback" when GEMINI_API_KEY is still a placeholder, so AI features degrade instead of failing.',
  email: 'Reads "dev-fallback" when EMAIL_PASS is still a placeholder; outbound mail is logged rather than sent.',
  supabase: "Storage bucket reachability for resumes, avatars and other uploaded media.",
};

export function AdminApiHealthPage() {
  const { session } = useAuth();

  const healthQuery = useQuery({
    queryKey: ["admin-api-health"],
    queryFn: () => apiRequest("/health", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    refetchInterval: 30000,
  });

  const services = Object.entries(healthQuery.data?.services || {});
  const environment = healthQuery.data?.environment;
  const degraded = services.filter(([, status]) => SERVICE_TONE[status] !== "adm-pill--pos");

  return (
    <AdminConsolePage
      eyebrow="Platform"
      title="API health"
      description="Live service status from the backend health probe. Refreshes every 30 seconds."
      actions={
        <button
          type="button"
          className="adm-btn"
          onClick={() => healthQuery.refetch()}
          disabled={healthQuery.isFetching}
        >
          {healthQuery.isFetching ? "Checking…" : "Check now"}
        </button>
      }
    >
      <section className="admin-console__section">
        <AdminCard
          eyebrow={environment ? `Environment · ${environment}` : "Environment"}
          title={
            healthQuery.isError
              ? "Backend unreachable"
              : degraded.length
                ? `${degraded.length} service${degraded.length === 1 ? "" : "s"} degraded`
                : "All services nominal"
          }
          action={
            healthQuery.dataUpdatedAt ? (
              <span className="adm-note">
                Checked{" "}
                <span className="adm-num">{formatDateTime(healthQuery.dataUpdatedAt)}</span>
              </span>
            ) : null
          }
        >
          <AdminQueryState
            query={healthQuery}
            isEmpty={!services.length}
            emptyLabel="The health probe returned no services."
          />

          {services.length ? (
            <AdminTable
              caption="Backend service status"
              columns={["Service", "Status", "What this reflects"]}
            >
              {services.map(([key, status]) => (
                <tr key={key}>
                  <td>
                    <span className="adm-candidate__name">{SERVICE_LABEL[key] || key}</span>
                  </td>
                  <td>
                    <span className={`adm-pill ${SERVICE_TONE[status] || ""}`.trim()}>{status}</span>
                  </td>
                  <td style={{ whiteSpace: "normal" }}>
                    <span className="adm-candidate__meta" style={{ whiteSpace: "normal" }}>
                      {SERVICE_DETAIL[key] || "Reported by the backend health probe."}
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
