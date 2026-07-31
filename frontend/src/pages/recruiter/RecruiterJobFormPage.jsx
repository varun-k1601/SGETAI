import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { SUPPORTED_CURRENCIES } from "../../utils/currencies";

const emptyForm = {
  title: "",
  description: "",
  location: "",
  industry: "",
  type: "Full-time",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  requirements: "",
  skills: "",
  skillsRequired: "",
  customFields: [],
};

// Only optional, fixed fields — nothing downstream (search index, embeddings, matching,
// auto-apply) strictly requires these, unlike title/description/skills/skillsRequired, which stay
// mandatory and are never offered a "Remove" control.
const OPTIONAL_FIELD_LABELS = {
  location: "Location",
  industry: "Industry",
  type: "Type",
  salary: "Salary",
  requirements: "Requirements",
};

// This app's global `button{}` rule in styles.css is unlayered, so it silently wins over any
// Tailwind utility class applied directly to a <button> — small ghost controls here use inline
// styles to opt out, same workaround used elsewhere (see ProSeekerDashboard.jsx's ghostButtonStyle).
const ghostButtonStyle = {
  border: "none",
  background: "transparent",
  boxShadow: "none",
  color: "inherit",
  fontWeight: 500,
  padding: 0,
};

function splitCsv(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value) {
  return (value || []).join(", ");
}

export function RecruiterJobFormPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = Boolean(jobId);
  const [form, setForm] = useState(emptyForm);
  const [hiddenFields, setHiddenFields] = useState([]);
  const [error, setError] = useState("");

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiRequest(`/jobs/${jobId}`, { token: session?.accessToken }),
    enabled: Boolean(isEditing && session?.accessToken),
  });

  const job = jobQuery.data?.job;

  useEffect(() => {
    if (job) {
      setForm({
        title: job.title || "",
        description: job.description || "",
        location: job.location || "",
        industry: job.industry || "",
        type: job.type || "Full-time",
        salaryMin: job.salary?.min ?? "",
        salaryMax: job.salary?.max ?? "",
        salaryCurrency: job.salary?.currency || "USD",
        requirements: joinList(job.requirements),
        skills: joinList(job.skills),
        skillsRequired: joinList(job.skillsRequired),
        customFields: (job.customFields || []).map((field) => ({
          label: field.label || "",
          value: field.value || "",
        })),
      });
      // A previously-saved job with no value for an optional field starts hidden on the form too,
      // so editing doesn't suddenly resurface a field the recruiter deliberately left blank.
      setHiddenFields(
        Object.keys(OPTIONAL_FIELD_LABELS).filter((key) => {
          if (key === "salary") {
            return job.salary?.min == null && job.salary?.max == null;
          }
          if (key === "requirements") {
            return !(job.requirements || []).length;
          }
          return !job[key];
        })
      );
    }
  }, [job]);

  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function hideField(key) {
    setHiddenFields((current) => (current.includes(key) ? current : [...current, key]));
  }

  function restoreField(key) {
    setHiddenFields((current) => current.filter((item) => item !== key));
  }

  function handleCustomFieldChange(index, key, value) {
    setForm((current) => ({
      ...current,
      customFields: current.customFields.map((field, itemIndex) =>
        itemIndex === index ? { ...field, [key]: value } : field
      ),
    }));
  }

  function addCustomField() {
    setForm((current) => ({
      ...current,
      customFields: [...current.customFields, { label: "", value: "" }],
    }));
  }

  function removeCustomField(index) {
    setForm((current) => ({
      ...current,
      customFields: current.customFields.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function buildBody() {
    const isHidden = (key) => hiddenFields.includes(key);

    return {
      title: form.title,
      description: form.description,
      location: isHidden("location") ? null : form.location,
      industry: isHidden("industry") ? null : form.industry,
      type: isHidden("type") ? null : form.type,
      salary: isHidden("salary")
        ? null
        : {
            min: form.salaryMin === "" ? undefined : Number(form.salaryMin),
            max: form.salaryMax === "" ? undefined : Number(form.salaryMax),
            currency: form.salaryCurrency,
          },
      requirements: isHidden("requirements") ? [] : splitCsv(form.requirements),
      skills: splitCsv(form.skills),
      skillsRequired: splitCsv(form.skillsRequired),
      customFields: form.customFields.filter((field) => field.label.trim()),
    };
  }

  const createMutation = useMutation({
    mutationFn: (status) =>
      apiRequest("/jobs", {
        method: "POST",
        token: session.accessToken,
        body: { ...buildBody(), status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-postings"] });
      navigate("/recruiter/job-postings");
    },
    onError: (err) => setError(err.message || "Failed to create job."),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/jobs/${jobId}`, {
        method: "PUT",
        token: session.accessToken,
        body: buildBody(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-postings"] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      navigate("/recruiter/job-postings");
    },
    onError: (err) => setError(err.message || "Failed to update job."),
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/jobs/${jobId}/publish`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-postings"] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      navigate("/recruiter/job-postings");
    },
    onError: (err) => setError(err.message || "Failed to publish job."),
  });

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate("Active");
    }
  }

  function handleSaveDraft() {
    setError("");
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    createMutation.mutate("Draft");
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || publishMutation.isPending;

  if (isEditing && jobQuery.isLoading) {
    return (
      <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          Loading job...
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <button
        onClick={() => navigate("/recruiter/job-postings")}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back to job postings
      </button>

      <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 shadow-elegant">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {isEditing ? "Edit job posting" : "New job posting"}
          </h1>
          {isEditing && job?.status && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
                job.status === "Active"
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border/60"
              }`}
            >
              {job.status}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => handleChange("title", event.target.value)}
                placeholder="Senior Frontend Engineer"
                required
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
            </label>
            {!hiddenFields.includes("type") && (
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Type</span>
                  <button
                    type="button"
                    onClick={() => hideField("type")}
                    style={ghostButtonStyle}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Remove ×
                  </button>
                </div>
                <select
                  value={form.type}
                  onChange={(event) => handleChange("type", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                  <option value="Remote">Remote</option>
                </select>
              </label>
            )}
          </div>

          {(!hiddenFields.includes("location") || !hiddenFields.includes("industry")) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {!hiddenFields.includes("location") && (
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Location</span>
                    <button
                      type="button"
                      onClick={() => hideField("location")}
                      style={ghostButtonStyle}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Remove ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(event) => handleChange("location", event.target.value)}
                    placeholder="Bangalore / Remote"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
              )}
              {!hiddenFields.includes("industry") && (
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Industry</span>
                    <button
                      type="button"
                      onClick={() => hideField("industry")}
                      style={ghostButtonStyle}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Remove ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(event) => handleChange("industry", event.target.value)}
                    placeholder="SaaS"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
              )}
            </div>
          )}

          {!hiddenFields.includes("salary") && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Salary</span>
                <button
                  type="button"
                  onClick={() => hideField("salary")}
                  style={ghostButtonStyle}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove ×
                </button>
              </div>
              <div className="mt-1 grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Min</span>
                  <input
                    type="number"
                    value={form.salaryMin}
                    onChange={(event) => handleChange("salaryMin", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Max</span>
                  <input
                    type="number"
                    value={form.salaryMax}
                    onChange={(event) => handleChange("salaryMax", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Currency</span>
                  <select
                    value={form.salaryCurrency}
                    onChange={(event) => handleChange("salaryCurrency", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Description</span>
            <textarea
              rows={5}
              value={form.description}
              onChange={(event) => handleChange("description", event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Required skills</span>
            <textarea
              rows={3}
              value={form.skillsRequired}
              onChange={(event) => handleChange("skillsRequired", event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Must-have skills — weighted highest in search and candidate matching. One per line, or comma-separated.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Preferred skills</span>
            <textarea
              rows={3}
              value={form.skills}
              onChange={(event) => handleChange("skills", event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Nice-to-have skills that aren't strictly required. One per line, or comma-separated.
            </span>
          </label>

          {!hiddenFields.includes("requirements") && (
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Requirements</span>
                <button
                  type="button"
                  onClick={() => hideField("requirements")}
                  style={ghostButtonStyle}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove ×
                </button>
              </div>
              <textarea
                rows={4}
                value={form.requirements}
                onChange={(event) => handleChange("requirements", event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
              <span className="mt-1 block text-xs text-muted-foreground">One requirement per line, or comma-separated.</span>
            </label>
          )}

          {hiddenFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Removed fields:</span>
              {hiddenFields.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => restoreField(key)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground"
                >
                  + Add {OPTIONAL_FIELD_LABELS[key]} back
                </button>
              ))}
            </div>
          )}

          {/* Custom fields — recruiter-defined label/value pairs stored on the job and included in
              the matching embedding (see backend/src/utils/textBuilders.js). */}
          <div>
            <span className="text-xs font-medium text-muted-foreground">Custom fields</span>
            <div className="mt-2 space-y-2">
              {form.customFields.map((field, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                  <input
                    type="text"
                    value={field.label}
                    onChange={(event) => handleCustomFieldChange(index, "label", event.target.value)}
                    placeholder="Label"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={(event) => handleCustomFieldChange(index, "value", event.target.value)}
                    placeholder="Value"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(index)}
                    style={ghostButtonStyle}
                    className="justify-self-start text-xs text-muted-foreground hover:text-foreground sm:justify-self-center"
                  >
                    Remove ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addCustomField}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface/80"
            >
              + Add custom field
            </button>
          </div>

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!isEditing && (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleSaveDraft}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-xs font-semibold text-foreground hover:bg-surface/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && createMutation.variables === "Draft" ? "Saving..." : "Save as draft"}
              </button>
            )}

            {!isEditing && (
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-gradient-recruiter px-4 text-xs font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && createMutation.variables === "Active" ? "Publishing..." : "Publish"}
              </button>
            )}

            {isEditing && (
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-xs font-semibold text-foreground hover:bg-surface/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            )}

            {isEditing && job?.status === "Draft" && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => publishMutation.mutate()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-gradient-recruiter px-4 text-xs font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishMutation.isPending ? "Publishing..." : "Publish"}
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
