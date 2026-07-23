import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

const initialForm = {
  targetRole: "",
  fullName: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  summary: "",
  skills: "",
  projects: "",
  education: "",
  experience: "",
  certifications: "",
  achievements: "",
};

function listFromLines(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listFromCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildContactLine(form, profile) {
  return [
    form.email || profile.email,
    form.phone || profile.phone,
    form.linkedinUrl,
    form.githubUrl,
    form.portfolioUrl,
  ].filter(Boolean).join(" | ");
}

function buildSummary(form, skills) {
  if (form.summary.trim()) {
    return form.summary.trim();
  }

  const role = form.targetRole || "the target role";
  const coreSkills = skills.slice(0, 5).join(", ") || "role-relevant tools and practical project work";

  return `Applicant targeting ${role} with strengths in ${coreSkills}. Focused on building reliable, ATS-aligned applications with measurable impact.`;
}

function buildResumeText(form, profile) {
  const skills = listFromCsv(form.skills);
  const projects = listFromLines(form.projects);
  const education = listFromLines(form.education);
  const experience = listFromLines(form.experience);
  const certifications = listFromLines(form.certifications);
  const achievements = listFromLines(form.achievements);
  const fullName = form.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Your Name";
  const contactLine = buildContactLine(form, profile);

  const lines = [
    fullName.toUpperCase(),
    contactLine,
    "",
    "TARGET ROLE",
    form.targetRole || "Target job title",
    "",
    "PROFESSIONAL SUMMARY",
    buildSummary(form, skills),
    "",
    "CORE SKILLS",
    skills.length ? skills.join(" | ") : "Add role-specific skills separated by commas.",
    "",
    "EXPERIENCE",
    ...(experience.length ? experience.map((item) => `- ${item}`) : ["- Fresher or no experience added. Highlight internships, academic work, or relevant responsibilities here."]),
    "",
    "PROJECTS",
    ...(projects.length ? projects.map((project) => `- ${project}`) : ["- Add 2-4 projects with tools used, problem solved, and measurable impact."]),
    "",
    "EDUCATION",
    ...(education.length ? education.map((item) => `- ${item}`) : ["- Add degree, institution, dates, GPA, or relevant coursework."]),
    "",
    "CERTIFICATIONS",
    ...(certifications.length ? certifications.map((item) => `- ${item}`) : ["- Add relevant certifications, courses, or training."]),
    "",
    "ACHIEVEMENTS",
    ...(achievements.length ? achievements.map((item) => `- ${item}`) : ["- Add awards, ranks, publications, hackathons, or measurable accomplishments."]),
  ];

  return lines.join("\n");
}

function buildResumeFileName(form) {
  const name = String(form.fullName || "sgetai-resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const role = String(form.targetRole || "ats")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${name || "sgetai-resume"}-${role || "ats"}.txt`;
}

export function ResumeBuilderPage() {
  const { session } = useAuth();
  const profile = session?.profile || {};
  const [form, setForm] = useState(() => ({
    ...initialForm,
    fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
    email: session?.email || profile.email || "",
    phone: profile.phone || "",
    linkedinUrl: profile.linkedinUrl || "",
    githubUrl: profile.githubUrl || "",
    portfolioUrl: profile.portfolioUrl || "",
    skills: Array.isArray(profile.skills) ? profile.skills.join(", ") : "",
    targetRole: Array.isArray(profile.preferredRoles) ? profile.preferredRoles[0] || "" : "",
    education: Array.isArray(profile.education)
      ? profile.education
          .map((item) => [item.degree, item.institution, item.fieldOfStudy].filter(Boolean).join(" - "))
          .join("\n")
      : "",
    experience: Array.isArray(profile.experience)
      ? profile.experience
          .map((item) => [item.jobTitle, item.companyName, item.description].filter(Boolean).join(" - "))
          .join("\n")
      : "",
    projects: Array.isArray(profile.projects)
      ? profile.projects.map((item) => [item.title, item.description].filter(Boolean).join(" - ")).join("\n")
      : "",
    certifications: Array.isArray(profile.licensesAndCertifications)
      ? profile.licensesAndCertifications.map((item) => [item.title, item.description].filter(Boolean).join(" - ")).join("\n")
      : "",
    achievements: Array.isArray(profile.achievements)
      ? profile.achievements.map((item) => [item.title, item.description].filter(Boolean).join(" - ")).join("\n")
      : "",
  }));
  const [generatedResume, setGeneratedResume] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleGenerate(event) {
    event.preventDefault();
    setGeneratedResume(buildResumeText(form, profile));
    setCopyStatus("");
  }

  async function handleCopy() {
    if (!generatedResume) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedResume);
      setCopyStatus("Resume copied to clipboard.");
    } catch {
      setCopyStatus("Copy failed. You can still select and copy the text manually.");
    }
  }

  function handleDownload() {
    if (!generatedResume) {
      return;
    }

    const blob = new Blob([generatedResume], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildResumeFileName(form);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setCopyStatus("ATS resume downloaded.");
  }

  if (session?.role !== "seeker") {
    return (
      <section className="info-card">
        <h3>Resume builder unavailable</h3>
        <p>This manual ATS resume builder is designed for applicant accounts.</p>
      </section>
    );
  }

  return (
    <section className="dashboard-stack">
      <section className="resume-builder-layout">
        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Resume inputs</h3>
              <p>Use short, impact-focused lines. Each project, education, or experience item can go on a new line.</p>
            </div>
            <span className="pill">ATS-ready draft</span>
          </div>

          <form className="auth-form auth-form--wide" onSubmit={handleGenerate}>
            <div className="form-grid">
              <label className="form-field">
                <span>Target role</span>
                <input
                  type="text"
                  value={form.targetRole}
                  onChange={(event) => updateField("targetRole", event.target.value)}
                  placeholder="Frontend Developer"
                />
              </label>
              <label className="form-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  placeholder="Your full name"
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="form-field">
                <span>Phone</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>LinkedIn URL</span>
                <input
                  type="url"
                  value={form.linkedinUrl}
                  onChange={(event) => updateField("linkedinUrl", event.target.value)}
                  placeholder="https://linkedin.com/in/your-profile"
                />
              </label>
              <label className="form-field">
                <span>GitHub URL</span>
                <input
                  type="url"
                  value={form.githubUrl}
                  onChange={(event) => updateField("githubUrl", event.target.value)}
                  placeholder="https://github.com/your-username"
                />
              </label>
            </div>

            <label className="form-field">
              <span>Portfolio URL</span>
              <input
                type="url"
                value={form.portfolioUrl}
                onChange={(event) => updateField("portfolioUrl", event.target.value)}
                placeholder="https://yourportfolio.com"
              />
            </label>

            <label className="form-field">
              <span>Professional summary</span>
              <textarea
                rows={3}
                value={form.summary}
                onChange={(event) => updateField("summary", event.target.value)}
                placeholder="2-3 lines about your strengths, target role, and impact."
              />
            </label>

            <label className="form-field">
              <span>Skills</span>
              <input
                type="text"
                value={form.skills}
                onChange={(event) => updateField("skills", event.target.value)}
                placeholder="React, Node.js, MongoDB, REST APIs"
              />
            </label>

            <label className="form-field">
              <span>Projects</span>
              <textarea
                rows={4}
                value={form.projects}
                onChange={(event) => updateField("projects", event.target.value)}
                placeholder="Job portal - Built React dashboard with API integration and application tracking."
              />
            </label>

            <label className="form-field">
              <span>Experience</span>
              <textarea
                rows={4}
                value={form.experience}
                onChange={(event) => updateField("experience", event.target.value)}
                placeholder="Software Intern - Improved page load speed by 30% using code splitting."
              />
            </label>

            <label className="form-field">
              <span>Education</span>
              <textarea
                rows={3}
                value={form.education}
                onChange={(event) => updateField("education", event.target.value)}
                placeholder="B.Tech CSE - University Name - 2026"
              />
            </label>

            <label className="form-field">
              <span>Certifications</span>
              <textarea
                rows={3}
                value={form.certifications}
                onChange={(event) => updateField("certifications", event.target.value)}
                placeholder="AWS Cloud Practitioner - 2025"
              />
            </label>

            <label className="form-field">
              <span>Achievements</span>
              <textarea
                rows={3}
                value={form.achievements}
                onChange={(event) => updateField("achievements", event.target.value)}
                placeholder="Qualified GATE CS with AIR 11405"
              />
            </label>

            <button type="submit">Generate ATS resume</button>
          </form>
        </article>

        <aside className="resume-preview-column">
          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Generated resume draft</h3>
                <p>Plain text is highly ATS-readable and can be attached or pasted into a document editor.</p>
              </div>
              <div className="button-row button-row--tight">
                <button type="button" className="outline-button" onClick={handleCopy} disabled={!generatedResume}>
                  Copy
                </button>
                <button type="button" className="outline-button" onClick={handleDownload} disabled={!generatedResume}>
                  Download
                </button>
              </div>
            </div>

            <AutoDismissFeedback feedback={copyStatus} onClear={() => setCopyStatus("")} />

            {generatedResume ? (
              <pre className="resume-output">{generatedResume}</pre>
            ) : (
              <div className="empty-state-card">
                <h4>No resume generated yet</h4>
                <p>Fill the inputs and click generate to create your first ATS-friendly draft.</p>
              </div>
            )}
          </article>
        </aside>
      </section>
    </section>
  );
}
