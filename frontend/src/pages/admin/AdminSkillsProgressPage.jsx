import { AdminConsolePage, AdminNotAvailable } from "./adminConsoleKit";

// NO DATA SOURCE. Nothing on this platform records skill proficiency, assessments, or learning
// progress over time: JobSeeker stores flat `skills` / `skillGroups` string arrays with no level,
// no evidence and no timestamps, and there is no assessment, course-completion or coaching model
// anywhere in backend/src/models. Rendering zeroes or sample learners here would read as a real
// measurement of an empty system, so the page states the gap instead.
export function AdminSkillsProgressPage() {
  return (
    <AdminConsolePage
      eyebrow="Development"
      title="Skills & progress"
      description="Skill proficiency and learning progression across the candidate base."
    >
      <section className="admin-console__section">
        <AdminNotAvailable
          what="No skills or progression data is being collected yet."
          why="JobSeeker records skills as flat, unlevelled string arrays with no assessment, evidence or history attached, so there is nothing to measure progression against. This page is deliberately empty rather than showing placeholder learners."
          needs={[
            "A skill-proficiency model with a level and a source of evidence per skill",
            "Assessment or course-completion records with timestamps, to derive a trend",
            "An aggregation endpoint over that history, in the shape adminTrendsService already uses",
          ]}
        />
      </section>
    </AdminConsolePage>
  );
}
