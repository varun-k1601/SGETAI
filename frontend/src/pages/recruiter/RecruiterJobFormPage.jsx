import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

const STATUS_TONE = { Active: "ok", Draft: "accent", Closed: "muted" };

// ---------------------------------------------------------------------------------------------
// LIST SERIALISATION.
//
// These four helpers replace the single splitCsv/joinList pair, which was DESTRUCTIVE for
// requirements. Requirements are prose sentences and routinely contain commas:
//
//   "Bachelor's degree in Computer Science, Information Technology, or a related field."
//
// splitting that on /[\n,]/ produced three separate "requirements", and because the form rejoined
// with ", " the damage compounded on every load-edit-save cycle. Requirements therefore split on
// NEWLINES ONLY and rejoin with "\n": one requirement per line, commas preserved verbatim.
//
// Skills stay comma-splittable — they are short tokens that rarely contain commas — but they must
// rejoin with the SAME separator they split on, or the round trip is not stable either.
// ---------------------------------------------------------------------------------------------

function splitLines(value) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value) {
  return (value || []).join("\n");
}

function splitCsv(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinCsv(value) {
  return (value || []).join(", ");
}

function IconArrowLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function IconChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconPlus(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// A labelled group of controls. fieldset/legend is the real grouping primitive for a form, so the
// visual card and the accessibility tree are the same thing rather than two parallel structures.
function FieldGroup({ title, description, action, children }) {
  return (
    <fieldset className="jf-card">
      <legend className="jf-card__legend">
        <span className="jf-card__title">{title}</span>
        {description && <span className="jf-card__desc">{description}</span>}
      </legend>
      {action}
      <div className="jf-card__body">{children}</div>
    </fieldset>
  );
}

// Renders label + optional remove control + the control itself + helper/error text, and hands the
// control the ids it needs so helper text and errors are actually announced rather than merely
// displayed next to it.
function Field({ id, label, helper, error, onRemove, removeLabel, wide, children }) {
  const helperId = helper ? `${id}-helper` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`jf-field${wide ? " jf-field--wide" : ""}`}>
      <div className="jf-field__head">
        <label className="jf-label" htmlFor={id}>
          {label}
        </label>
        {onRemove && (
          <button type="button" className="jf-remove" onClick={onRemove} aria-label={removeLabel}>
            <IconX className="jf-icon jf-icon--xs" />
            Remove
          </button>
        )}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {helper && (
        <p className="jf-helper" id={helperId}>
          {helper}
        </p>
      )}
      {error && (
        <p className="jf-fielderror" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
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
  const [fieldErrors, setFieldErrors] = useState({});
  // What was last loaded (or, when creating, the empty form). The save action compares against
  // this so it can be disabled while nothing has actually changed.
  const [baseline, setBaseline] = useState({ form: emptyForm, hiddenFields: [] });
  const uid = useId();
  const titleRef = useRef(null);

  const fid = (name) => `${uid}-${name}`;

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiRequest(`/jobs/${jobId}`, { token: session?.accessToken }),
    enabled: Boolean(isEditing && session?.accessToken),
  });

  const job = jobQuery.data?.job;

  useEffect(() => {
    if (job) {
      const loaded = {
        title: job.title || "",
        description: job.description || "",
        location: job.location || "",
        industry: job.industry || "",
        type: job.type || "Full-time",
        salaryMin: job.salary?.min ?? "",
        salaryMax: job.salary?.max ?? "",
        salaryCurrency: job.salary?.currency || "USD",
        // Newline-joined, matching splitLines on the way back out. This is the half of the fix
        // that makes the round trip stable.
        requirements: joinLines(job.requirements),
        skills: joinCsv(job.skills),
        skillsRequired: joinCsv(job.skillsRequired),
        customFields: (job.customFields || []).map((field) => ({
          label: field.label || "",
          value: field.value || "",
        })),
      };
      setForm(loaded);
      // A previously-saved job with no value for an optional field starts hidden on the form too,
      // so editing doesn't suddenly resurface a field the recruiter deliberately left blank.
      const hidden = Object.keys(OPTIONAL_FIELD_LABELS).filter((key) => {
        if (key === "salary") {
          return job.salary?.min == null && job.salary?.max == null;
        }
        if (key === "requirements") {
          return !(job.requirements || []).length;
        }
        return !job[key];
      });
      setHiddenFields(hidden);
      setBaseline({ form: loaded, hiddenFields: hidden });
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
      // splitLines, not splitCsv: a requirement may contain commas and must survive them.
      requirements: isHidden("requirements") ? [] : splitLines(form.requirements),
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

  // Title is the only client-side requirement, exactly as before — the backend enforces the rest.
  function validate() {
    if (!form.title.trim()) {
      setFieldErrors({ title: "Title is required." });
      setError("Title is required.");
      titleRef.current?.focus();
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!validate()) return;

    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate("Active");
    }
  }

  function handleSaveDraft() {
    setError("");
    if (!validate()) return;
    createMutation.mutate("Draft");
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || publishMutation.isPending;

  const isDirty = useMemo(() => {
    const shape = (f, h) => JSON.stringify({ f, h: [...h].sort() });
    return shape(form, hiddenFields) !== shape(baseline.form, baseline.hiddenFields);
  }, [form, hiddenFields, baseline]);

  if (isEditing && jobQuery.isLoading) {
    return (
      <section className="job-form">
        <Link to="/recruiter/job-postings" className="jf-back">
          <IconArrowLeft className="jf-icon jf-icon--sm" />
          Back to job postings
        </Link>
        <p className="jf-card jf-state">Loading job...</p>
      </section>
    );
  }

  if (isEditing && jobQuery.isError) {
    return (
      <section className="job-form">
        <Link to="/recruiter/job-postings" className="jf-back">
          <IconArrowLeft className="jf-icon jf-icon--sm" />
          Back to job postings
        </Link>
        <p className="jf-card jf-state jf-state--error">
          {jobQuery.error?.message || "Could not load this job posting."}
        </p>
      </section>
    );
  }

  const statusTone = (job?.status && STATUS_TONE[job.status]) || "muted";

  return (
    <section className="job-form">
      {/* Secondary navigation, so it is a link rather than a button — same treatment as the job
          detail page's back link. */}
      <Link to="/recruiter/job-postings" className="jf-back">
        <IconArrowLeft className="jf-icon jf-icon--sm" />
        Back to job postings
      </Link>

      <header className="jf-hero">
        <div className="jf-hero__text">
          <p className="jf-eyebrow">Hiring</p>
          <h1 className="jf-hero__title">{isEditing ? "Edit job posting" : "New job posting"}</h1>
          {isEditing && job?.postedBy?.name && (
            <p className="jf-hero__sub">Posted by {job.postedBy.name}</p>
          )}
        </div>
        {isEditing && job?.status && (
          <span className={`jf-pill jf-pill--${statusTone}`}>{job.status}</span>
        )}
      </header>

      <form onSubmit={handleSubmit} className="jf-form" noValidate>
        <FieldGroup title="Basics" description="The headline details candidates see first.">
          <Field
            id={fid("title")}
            label="Title"
            error={fieldErrors.title}
            helper="Required."
            wide
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                ref={titleRef}
                type="text"
                className="jf-input"
                value={form.title}
                onChange={(event) => handleChange("title", event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                aria-required="true"
              />
            )}
          </Field>

          {!hiddenFields.includes("type") && (
            <Field
              id={fid("type")}
              label="Type"
              onRemove={() => hideField("type")}
              removeLabel="Remove Type"
            >
              {({ id, describedBy }) => (
                <span className="jf-selectwrap">
                  <select
                    id={id}
                    className="jf-input jf-select"
                    value={form.type}
                    onChange={(event) => handleChange("type", event.target.value)}
                    aria-describedby={describedBy}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                    <option value="Remote">Remote</option>
                  </select>
                  <IconChevronDown className="jf-chevron" />
                </span>
              )}
            </Field>
          )}

          {!hiddenFields.includes("location") && (
            <Field
              id={fid("location")}
              label="Location"
              onRemove={() => hideField("location")}
              removeLabel="Remove Location"
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="text"
                  className="jf-input"
                  value={form.location}
                  onChange={(event) => handleChange("location", event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          )}

          {!hiddenFields.includes("industry") && (
            <Field
              id={fid("industry")}
              label="Industry"
              onRemove={() => hideField("industry")}
              removeLabel="Remove Industry"
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="text"
                  className="jf-input"
                  value={form.industry}
                  onChange={(event) => handleChange("industry", event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          )}
        </FieldGroup>

        {!hiddenFields.includes("salary") && (
          <FieldGroup
            title="Compensation"
            description="Shown as a range on the posting."
            action={
              <button
                type="button"
                className="jf-remove jf-remove--card"
                onClick={() => hideField("salary")}
                aria-label="Remove Salary"
              >
                <IconX className="jf-icon jf-icon--xs" />
                Remove
              </button>
            }
          >
            <Field id={fid("salaryMin")} label="Minimum">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="number"
                  className="jf-input"
                  value={form.salaryMin}
                  onChange={(event) => handleChange("salaryMin", event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <Field id={fid("salaryMax")} label="Maximum">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="number"
                  className="jf-input"
                  value={form.salaryMax}
                  onChange={(event) => handleChange("salaryMax", event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <Field id={fid("salaryCurrency")} label="Currency">
              {({ id, describedBy }) => (
                <span className="jf-selectwrap">
                  <select
                    id={id}
                    className="jf-input jf-select"
                    value={form.salaryCurrency}
                    onChange={(event) => handleChange("salaryCurrency", event.target.value)}
                    aria-describedby={describedBy}
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                  <IconChevronDown className="jf-chevron" />
                </span>
              )}
            </Field>
          </FieldGroup>
        )}

        <FieldGroup title="Description" description="The body of the posting.">
          <Field id={fid("description")} label="Description" wide>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={14}
                className="jf-input jf-textarea jf-textarea--tall"
                value={form.description}
                onChange={(event) => handleChange("description", event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        </FieldGroup>

        <FieldGroup title="Skills" description="Drives search ranking and candidate matching.">
          <Field
            id={fid("skillsRequired")}
            label="Required skills"
            helper="Must-have skills — weighted highest in search and candidate matching. One per line, or comma-separated."
            wide
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={6}
                className="jf-input jf-textarea"
                value={form.skillsRequired}
                onChange={(event) => handleChange("skillsRequired", event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Field
            id={fid("skills")}
            label="Preferred skills"
            helper="Nice-to-have skills that aren't strictly required. One per line, or comma-separated."
            wide
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={6}
                className="jf-input jf-textarea"
                value={form.skills}
                onChange={(event) => handleChange("skills", event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        </FieldGroup>

        {!hiddenFields.includes("requirements") && (
          <FieldGroup
            title="Requirements"
            description="One per line."
            action={
              <button
                type="button"
                className="jf-remove jf-remove--card"
                onClick={() => hideField("requirements")}
                aria-label="Remove Requirements"
              >
                <IconX className="jf-icon jf-icon--xs" />
                Remove
              </button>
            }
          >
            <Field
              id={fid("requirements")}
              label="Requirements"
              // The old helper said "or comma-separated", which is precisely what shattered
              // sentences like "…Computer Science, Information Technology, or a related field."
              helper="One requirement per line. Line breaks separate entries — commas are kept as part of the text."
              wide
            >
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  rows={10}
                  className="jf-input jf-textarea jf-textarea--tall"
                  value={form.requirements}
                  onChange={(event) => handleChange("requirements", event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          </FieldGroup>
        )}

        {/* Custom fields — recruiter-defined label/value pairs stored on the job and included in
            the matching embedding (see backend/src/utils/textBuilders.js). */}
        <FieldGroup
          title="Custom fields"
          description="Extra label/value pairs, e.g. “Visa sponsorship: Yes”."
        >
          {form.customFields.length > 0 && (
            <ul className="jf-customs">
              {form.customFields.map((field, index) => (
                <li key={index} className="jf-custom">
                  <div className="jf-custom__pair">
                    <div className="jf-field">
                      <label className="jf-label" htmlFor={fid(`cf-label-${index}`)}>
                        Label
                      </label>
                      <input
                        id={fid(`cf-label-${index}`)}
                        type="text"
                        className="jf-input"
                        value={field.label}
                        onChange={(event) => handleCustomFieldChange(index, "label", event.target.value)}
                      />
                    </div>
                    <div className="jf-field">
                      <label className="jf-label" htmlFor={fid(`cf-value-${index}`)}>
                        Value
                      </label>
                      <input
                        id={fid(`cf-value-${index}`)}
                        type="text"
                        className="jf-input"
                        value={field.value}
                        onChange={(event) => handleCustomFieldChange(index, "value", event.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="jf-remove jf-remove--row"
                    onClick={() => removeCustomField(index)}
                    aria-label={
                      field.label.trim()
                        ? `Remove custom field ${field.label.trim()}`
                        : `Remove custom field ${index + 1}`
                    }
                  >
                    <IconX className="jf-icon jf-icon--xs" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="jf-btn jf-btn--ghost" onClick={addCustomField}>
            <IconPlus className="jf-icon jf-icon--sm" />
            Add custom field
          </button>
        </FieldGroup>

        {/* Removing a field only hides it — the value is preserved in form state and the field can
            be brought back from here, so nothing is lost until save. */}
        {hiddenFields.length > 0 && (
          <div className="jf-restore">
            <p className="jf-restore__label">Removed fields</p>
            <div className="jf-restore__chips">
              {hiddenFields.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="jf-chip"
                  onClick={() => restoreField(key)}
                  aria-label={`Add ${OPTIONAL_FIELD_LABELS[key]} back`}
                >
                  <IconPlus className="jf-icon jf-icon--xs" />
                  {OPTIONAL_FIELD_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Last in DOM order, so it is reached by Tab after the final field rather than before it. */}
        <div className="jf-savebar">
          <p className="jf-savebar__status" role="status">
            {error ? (
              <span className="jf-savebar__error">{error}</span>
            ) : isDirty ? (
              "Unsaved changes"
            ) : isEditing ? (
              "No changes yet"
            ) : (
              ""
            )}
          </p>

          <div className="jf-savebar__actions">
            {!isEditing && (
              <button
                type="button"
                className="jf-btn"
                disabled={isBusy || !isDirty}
                onClick={handleSaveDraft}
              >
                {createMutation.isPending && createMutation.variables === "Draft"
                  ? "Saving..."
                  : "Save as draft"}
              </button>
            )}

            {!isEditing && (
              <button type="submit" className="jf-btn jf-btn--primary" disabled={isBusy || !isDirty}>
                {createMutation.isPending && createMutation.variables === "Active"
                  ? "Publishing..."
                  : "Publish"}
              </button>
            )}

            {isEditing && (
              <button type="submit" className="jf-btn jf-btn--primary" disabled={isBusy || !isDirty}>
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            )}

            {/* Publishing an unchanged draft is legitimate, so this one is never gated on dirty. */}
            {isEditing && job?.status === "Draft" && (
              <button
                type="button"
                className="jf-btn jf-btn--primary"
                disabled={isBusy}
                onClick={() => publishMutation.mutate()}
              >
                {publishMutation.isPending ? "Publishing..." : "Publish"}
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
