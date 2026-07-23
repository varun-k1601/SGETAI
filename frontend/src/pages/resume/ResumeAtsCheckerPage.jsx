import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiFormRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { CompanyLogo } from "../../components/CompanyLogo";
import { RagAnalysisPanel } from "../../components/resume/RagAnalysisPanel";

function JobOption({ job, selected, onSelect }) {
  return (
    <button
      type="button"
      className={selected ? "job-card job-card--target selected" : "job-card job-card--target"}
      onClick={() => onSelect(job)}
    >
      <div className="job-card__body">
        <div>
          <strong>{job.title}</strong>
          <p className="company-line">
            <CompanyLogo organization={job.organizationId} size="sm" />
            <span>{job.organizationId?.companyName || "Company"}</span>
          </p>
        </div>
        <div className="job-card__badges">
          <span className="pill">{job.type || "Open role"}</span>
          {selected ? <span className="selected-job-badge">Selected</span> : null}
        </div>
      </div>
      <div className="job-card__meta">
        <span>{job.location || "Flexible"}</span>
        <span>{job.industry || "General"}</span>
      </div>
    </button>
  );
}

function ScoreRing({ score = 0, tag = "ATS result" }) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score || 0)));

  return (
    <div className="ats-score-card">
      <div
        className="ats-score-ring"
        style={{ "--score": `${normalizedScore * 3.6}deg` }}
      >
        <strong>{normalizedScore}</strong>
        <span>/100</span>
      </div>
      <div>
        <h3>{tag}</h3>
        <p>Resume-to-job ATS match score</p>
      </div>
    </div>
  );
}

export function ResumeAtsCheckerPage() {
  const { session } = useAuth();
  const [filters, setFilters] = useState({ q: "", location: "" });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [useRag, setUseRag] = useState(false);
  const [ragAnalysis, setRagAnalysis] = useState(null);

  const searchQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q.trim()) {
      params.set("q", filters.q.trim());
    }
    if (filters.location.trim()) {
      params.set("location", filters.location.trim());
    }
    params.set("limit", "10");
    return params.toString();
  }, [filters]);

  const jobsQuery = useQuery({
    queryKey: ["ats-checker-jobs", searchQueryString],
    queryFn: () => apiRequest(`/search/jobs?${searchQueryString}`),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const atsMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();

      if (resumeFile) {
        formData.append("file", resumeFile);
      }
      if (resumeText.trim()) {
        formData.append("resumeText", resumeText);
      }
      if (selectedJobId) {
        formData.append("jobId", selectedJobId);
      } else {
        formData.append("jobDescription", jobDescription);
      }

      return apiFormRequest("/resume/ats-check", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "ATS check completed.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const ragMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();

      if (resumeFile) {
        formData.append("file", resumeFile);
      }

      const uploadRes = await apiFormRequest("/resume-rag/upload", {
        method: "POST",
        token: session.accessToken,
        formData,
      });

      const resumeId = uploadRes.resumeId;

      const analysisBody = {
        resumeId
      };

      if (selectedJobId) {
        analysisBody.jobId = selectedJobId;
      } else if (jobDescription.trim()) {
        analysisBody.jobDescription = jobDescription;
      }

      const analysisRes = await apiRequest("/resume-rag/quick-analyze", {
        method: "POST",
        token: session.accessToken,
        body: analysisBody
      });

      return analysisRes.analysis;
    },
    onSuccess: (analysis) => {
      setRagAnalysis(analysis);
      setFeedback({
        type: "success",
        message: "RAG analysis completed successfully!",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (session?.role !== "seeker") {
    return (
      <section className="info-card">
        <h3>ATS checker unavailable</h3>
        <p>This tool is designed for applicant accounts.</p>
      </section>
    );
  }

  const jobs = jobsQuery.data?.jobs || [];
  const selectedJob = jobs.find((job) => job._id === selectedJobId) || null;
  const result = atsMutation.data?.result;
  const matchedKeywords = result?.reasoning?.matchedKeywords || [];
  const missingKeywords = result?.reasoning?.missingKeywords || [];

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFeedback({ type: "", message: "" });
    setRagAnalysis(null);

    if (!resumeFile && !resumeText.trim()) {
      setFeedback({ type: "error", message: "Upload a resume or paste resume text." });
      return;
    }

    if (!selectedJobId && !jobDescription.trim()) {
      setFeedback({ type: "error", message: "Select a job or paste a job description." });
      return;
    }

    if (useRag && !resumeFile) {
      setFeedback({ type: "error", message: "RAG analysis requires an uploaded resume file, not pasted text." });
      return;
    }

    if (useRag) {
      ragMutation.mutate();
    } else {
      atsMutation.mutate();
    }
  }

  return (
    <section className="dashboard-stack">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="ats-checker-layout">
        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Resume and target job</h3>
              <p>Use a text-based PDF/DOCX/TXT, or paste resume text if extraction is weak.</p>
            </div>
            <span className="pill">Pre-apply tool</span>
          </div>

          <form className="auth-form auth-form--wide" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Upload resume</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
              />
            </label>

            <label className="form-field">
              <span>Or paste resume text</span>
              <textarea
                rows={5}
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                placeholder="Paste resume text here if you want to test without a file..."
              />
            </label>

            <div className="form-grid">
              <label className="form-field">
                <span>Search jobs</span>
                <input
                  type="text"
                  value={filters.q}
                  onChange={(event) => updateFilter("q", event.target.value)}
                  placeholder="React, backend, data analyst..."
                />
              </label>
              <label className="form-field">
                <span>Location</span>
                <input
                  type="text"
                  value={filters.location}
                  onChange={(event) => updateFilter("location", event.target.value)}
                  placeholder="Remote, Bengaluru..."
                />
              </label>
            </div>

            <div className="ats-job-picker">
              {jobsQuery.isLoading ? <p>Loading jobs...</p> : null}
              {jobs.map((job) => (
                <JobOption
                  key={job._id}
                  job={job}
                  selected={selectedJobId === job._id}
                  onSelect={(nextJob) => {
                    setSelectedJobId(nextJob._id);
                    setJobDescription("");
                  }}
                />
              ))}
              {!jobsQuery.isLoading && !jobs.length ? (
                <p>No jobs matched this search. Paste a job description below instead.</p>
              ) : null}
            </div>

            <label className="form-field">
              <span>Or paste job description</span>
              <textarea
                rows={5}
                value={jobDescription}
                onChange={(event) => {
                  setJobDescription(event.target.value);
                  if (event.target.value.trim()) {
                    setSelectedJobId("");
                  }
                }}
                placeholder="Paste job description if you do not want to select a posted job..."
              />
            </label>

            {selectedJob ? (
              <div className="feedback-banner">
                Selected job: {selectedJob.title} at {selectedJob.organizationId?.companyName || "company"}
              </div>
            ) : null}

            <div className="form-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useRag}
                  onChange={(e) => setUseRag(e.target.checked)}
                />
                <span>Use RAG AI Analysis (experimental)</span>
              </label>
              <p className="field-hint">RAG uses Ollama AI for deeper semantic analysis. Requires file upload.</p>
            </div>

            <button type="submit" disabled={atsMutation.isPending || ragMutation.isPending}>
              {ragMutation.isPending ? "Analyzing with AI..." : atsMutation.isPending ? "Checking..." : useRag ? "Analyze with RAG" : "Check ATS score"}
            </button>
          </form>
        </article>

        <aside className="ats-result-column">
          {ragAnalysis ? (
            <article className="info-card">
              <RagAnalysisPanel
                analysis={ragAnalysis}
                isLoading={ragMutation.isPending}
                error={ragMutation.error?.message}
              />
            </article>
          ) : (
            <>
              <article className="info-card">
                <h3>{useRag ? "RAG Analysis" : "ATS result"}</h3>
                {ragMutation.isPending ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <div className="loading-spinner" />
                    <p>Analyzing resume with Ollama AI...</p>
                  </div>
                ) : result ? (
                  <ScoreRing score={result.score} tag={result.tag} />
                ) : (
                  <div className="empty-state-card">
                    <h4>No score yet</h4>
                    <p>Upload a resume and run the {useRag ? "RAG" : "ATS"} checker to see your score.</p>
                  </div>
                )}
              </article>

              {result && !useRag ? (
                <>
                  <article className="info-card">
                    <div className="section-head">
                      <div>
                        <h3>Matched keywords</h3>
                        <p>These important job keywords were found in your resume.</p>
                      </div>
                      <span className="pill">{matchedKeywords.length}</span>
                    </div>
                    <div className="tag-row">
                      {matchedKeywords.map((keyword) => (
                        <span key={keyword} className="tag-pill">
                          {keyword}
                        </span>
                      ))}
                      {!matchedKeywords.length ? <span className="tag-pill muted-tag">No strong matches yet</span> : null}
                    </div>
                  </article>

                  <article className="info-card">
                    <div className="section-head">
                      <div>
                        <h3>Missing keywords</h3>
                        <p>Add these only where they truthfully match your experience.</p>
                      </div>
                      <span className="pill">{missingKeywords.length}</span>
                    </div>
                    <div className="tag-row">
                      {missingKeywords.slice(0, 16).map((keyword) => (
                        <span key={keyword} className="tag-pill muted-tag">
                          {keyword}
                        </span>
                      ))}
                      {!missingKeywords.length ? <span className="tag-pill">Coverage looks strong</span> : null}
                    </div>
                  </article>

                  <article className="info-card">
                    <h3>Suggestions</h3>
                    <ul className="simple-list">
                      {(result.suggestions || []).map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="info-card">
                    <h3>Extraction details</h3>
                    <div className="metric-list">
                      <div>
                        <span>File</span>
                        <strong>{atsMutation.data?.resume?.fileName || "Pasted text"}</strong>
                      </div>
                      <div>
                        <span>Extracted characters</span>
                        <strong>{atsMutation.data?.resume?.extractedCharacters || 0}</strong>
                      </div>
                    </div>
                  </article>
                </>
              ) : null}
            </>
          )}
        </aside>
      </section>
    </section>
  );
}
