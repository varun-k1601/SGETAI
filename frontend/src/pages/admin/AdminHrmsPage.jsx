import { AdminConsolePage, AdminNotAvailable } from "./adminConsoleKit";

// NO DATA SOURCE. The platform models hiring, not employment: OrganizationMember covers recruiter
// seats (role, status, invites) and stops there. There is no employee, contract, leave, payroll or
// attendance model in backend/src/models, so no HRMS figure on this page could be sourced from
// anything real.
export function AdminHrmsPage() {
  return (
    <AdminConsolePage
      eyebrow="Workforce"
      title="HRMS"
      description="Employee records, leave, and payroll operations."
    >
      <section className="admin-console__section">
        <AdminNotAvailable
          what="No HRMS data exists on this platform."
          why="The data model covers hiring rather than employment. OrganizationMember represents recruiter seats — role, status and invitations — and there is no employee, contract, leave, attendance or payroll record anywhere to report on."
          needs={[
            "An employee record distinct from OrganizationMember, with employment dates and contract terms",
            "Leave and attendance models, plus an approval workflow",
            "A payroll source, or an integration with an external HRMS as the system of record",
          ]}
        />
      </section>
    </AdminConsolePage>
  );
}
