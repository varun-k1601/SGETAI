import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { CompanyLogo } from "../../components/CompanyLogo";

function JobPickerCard({ job, selected, onSelect }) {
  const companyName =
    job.organizationId?.companyName ||
    job.companyName ||
    job.organizationName ||
    "Company name unavailable";

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
            <span>{companyName}</span>
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

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function isPdfBlob(blob) {
  return (await blob.slice(0, 5).text()) === "%PDF-";
}

function latexToReadableHtml(latex) {
  const escaped = String(latex || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\\section\*\{([^}]+)\}/g, "<h2>$1</h2>")
    .replace(/\\begin\{center\}|\\end\{center\}/g, "")
    .replace(/\\begin\{itemize\}|\\end\{itemize\}/g, "")
    .replace(/\\item\s+/g, "<li>")
    .replace(/\\textbf\{([^}]+)\}/g, "<strong>$1</strong>")
    .replace(/\\LARGE/g, "")
    .replace(/\\\\/g, "<br />")
    .replace(/\\;\\textbullet\\;/g, " • ")
    .replace(/\\;\\|\\;/g, " | ")
    .replace(/\\[a-zA-Z]+\{?[^}\n]*\}?/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("<h2>") || line.startsWith("<li>") ? line : `<p>${line}</p>`))
    .join("\n");
}

function buildPrintableResumeHtml({ latex, title }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 820px; margin: 40px auto; line-height: 1.55; color: #172033; }
      h2 { margin-top: 28px; border-bottom: 1px solid #d7deea; padding-bottom: 6px; color: #1f5edb; }
      p { margin: 8px 0; }
      li { margin: 6px 0 6px 20px; }
      strong { color: #111827; }
      @media print { body { margin: 18mm; } }
    </style>
  </head>
  <body>
    ${latexToReadableHtml(latex)}
  </body>
</html>`;
}

function decodeLatexText(value) {
  return String(value || "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^");
}

function latexToPdfRows(latex) {
  const rows = [];
  const lines = String(latex || "")
    .replace(/\\documentclass[\s\S]*?\\begin\{document\}/, "")
    .replace(/\\end\{document\}/g, "")
    .replace(/\\usepackage(?:\[[^\]]+\])?\{[^}]+\}/g, "")
    .replace(/\\setlist[^\\\n]*/g, "")
    .replace(/\\begin\{center\}|\\end\{center\}/g, "")
    .replace(/\\begin\{itemize\}|\\end\{itemize\}/g, "")
    .replace(/\\LARGE/g, "")
    .replace(/\\\\/g, "\n")
    .split("\n");

  lines.forEach((rawLine) => {
    let line = rawLine.trim();

    if (!line) {
      rows.push({ text: "", type: "space" });
      return;
    }

    const sectionMatch = line.match(/\\section\*\{([^}]+)\}/);
    const normalSectionMatch = line.match(/\\section\{([^}]+)\}/);
    if (sectionMatch) {
      rows.push({ text: decodeLatexText(sectionMatch[1]), type: "section" });
      return;
    }
    if (normalSectionMatch) {
      rows.push({ text: decodeLatexText(normalSectionMatch[1]), type: "section" });
      return;
    }

    line = line
      .replace(/\\href\{[^}]+\}\{([^}]*)\}/g, "$1")
      .replace(/\\underline\{([^}]*)\}/g, "$1")
      .replace(/\\resumeItem\{([^}]*)\}/g, "• $1")
      .replace(/\\resumeProjectHeading/g, "")
      .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, "")
      .replace(/\\vspace\{[^}]*\}/g, "")
      .replace(/\\item\s+/g, "• ")
      .replace(/\\textbf\{([^}]+)\}/g, "$1")
      .replace(/\\emph\{([^}]+)\}/g, "$1")
      .replace(/\\hfill/g, "    ")
      .replace(/\\;\\textbullet\\;/g, " • ")
      .replace(/\\;\\|\\;/g, " | ")
      .replace(/\\fa[A-Za-z]+/g, "")
      .replace(/\\[a-zA-Z]+(?:\[[^\]]+\])?/g, "")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (line) {
      rows.push({
        text: decodeLatexText(line),
        type: line.startsWith("•") ? "bullet" : "body",
      });
    }
  });

  return rows.filter((row, index, allRows) => {
    return !(row.type === "space" && allRows[index - 1]?.type === "space");
  });
}

function latexToPdfRowsClean(latex) {
  const rows = [];
  let seenSection = false;
  const lines = String(latex || "")
    .replace(/^%.*$/gm, "")
    .replace(/\\documentclass[\s\S]*?\\begin\{document\}/, "")
    .replace(/\\end\{document\}/g, "")
    .replace(/\\usepackage(?:\[[^\]]+\])?\{[^}]+\}/g, "")
    .replace(/\\setlist[^\\\n]*/g, "")
    .replace(/\\begin\{center\}|\\end\{center\}/g, "\n")
    .replace(/\\begin\{itemize\}(?:\[[^\]]*\])?|\\end\{itemize\}/g, "\n")
    .replace(/\\begin\{tabular\*\}\{[^}]*\}\{[^}]*\}|\\end\{tabular\*\}/g, "")
    .replace(/\\\\/g, "\n")
    .split("\n");

  lines.forEach((rawLine) => {
    let line = rawLine.trim();

    if (!line || /^%/.test(line)) {
      rows.push({ text: "", type: "space" });
      return;
    }

    const sectionMatch = line.match(/\\section\*?\{([^}]+)\}/);
    if (sectionMatch) {
      seenSection = true;
      rows.push({ text: decodeLatexText(sectionMatch[1]), type: "section" });
      return;
    }

    line = line
      .replace(/\\href\{[^}]*\}\{/g, "")
      .replace(/\\underline\{([^}]*)\}/g, "$1")
      .replace(/\\resumeItem\{([^}]*)\}/g, "- $1")
      .replace(/\\resumeProjectHeading/g, "")
      .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, "")
      .replace(/\\vspace\{[^}]*\}/g, "")
      .replace(/\\item\[\]/g, "")
      .replace(/\\item(?:\[[^\]]*\])?/g, "- ")
      .replace(/\\textbf\{([^}]+)\}/g, "$1")
      .replace(/\\emph\{([^}]+)\}/g, "$1")
      .replace(/\\small|\\Huge|\\large|\\scshape|\\bfseries|\\raggedright/g, "")
      .replace(/\\hfill/g, "    ")
      .replace(/\$\s*\|\s*\$/g, "|")
      .replace(/\$/g, "")
      .replace(/\\;\\textbullet\\;/g, " - ")
      .replace(/\\;\\|\\;/g, " | ")
      .replace(/\\fa[A-Za-z]+/g, "")
      .replace(/\[[^\]]*(leftmargin|label|itemsep|topsep)[^\]]*\]/g, "")
      .replace(/\\[a-zA-Z]+(?:\[[^\]]+\])?/g, "")
      .replace(/&&/g, " ")
      .replace(/&/g, " ")
      .replace(/\\/g, "")
      .replace(/~/g, " ")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (line && !/^(pt|[0-9.]+pt|\[[^\]]+\])$/.test(line)) {
      rows.push({
        text: decodeLatexText(line),
        type: line.startsWith("-") ? "bullet" : seenSection ? "body" : rows.some((row) => row.type === "name") ? "contact" : "name",
      });
    }
  });

  return rows.filter((row, index, allRows) => {
    return !(row.type === "space" && allRows[index - 1]?.type === "space");
  });
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text, maxLength) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function buildResumePdfBlob({ latex }) {
  const rows = latexToPdfRowsClean(latex);
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 36;
  const topY = 766;
  const bottomY = 34;
  const pages = [[]];
  let y = topY;

  function addLine(line) {
    if (y < bottomY) {
      pages.push([]);
      y = topY;
    }

    pages[pages.length - 1].push({ ...line, y });
    y -= line.lineHeight;
  }

  rows.forEach((row) => {
    if (row.type === "space") {
      y -= 2.5;
      return;
    }

    if (row.type === "section") {
      y -= 5;
      addLine({ text: row.text, x: marginX, font: "F2", size: 11.2, lineHeight: 14, type: "section" });
      return;
    }

    if (row.type === "name") {
      addLine({
        text: row.text,
        x: Math.max(marginX, pageWidth / 2 - row.text.length * 3.9),
        font: "F2",
        size: 16,
        lineHeight: 15,
        type: "name",
      });
      return;
    }

    if (row.type === "contact") {
      addLine({
        text: row.text,
        x: Math.max(marginX, pageWidth / 2 - row.text.length * 1.85),
        font: "F1",
        size: 7.2,
        lineHeight: 8.5,
        type: "contact",
      });
      return;
    }

    const indent = row.type === "bullet" ? 10 : 0;
    wrapText(row.text, row.type === "bullet" ? 118 : 124).forEach((line, index) => {
      addLine({
        text: index > 0 && row.type === "bullet" ? line.replace(/^•\s*/, "") : line,
        x: marginX + indent,
        font: "F1",
        size: 7.9,
        lineHeight: 9.7,
        type: row.type,
      });
    });
  });

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const pageIds = [];

  pages.forEach((pageLines) => {
    const stream = pageLines
      .flatMap((line) => {
        const textCommand = `BT /${line.font} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`;

        if (line.type === "section") {
          return [
            textCommand,
            `0.25 w ${marginX} ${line.y - 3} m ${pageWidth - marginX} ${line.y - 3} l S`
          ];
        }

        return [textCommand];
      })
      .join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function ReadinessItem({ label, ready, hint }) {
  return (
    <article className={ready ? "readiness-item ready" : "readiness-item blocked"}>
      <strong>{ready ? "Ready" : "Missing"}</strong>
      <div>
        <span>{label}</span>
        <p>{hint}</p>
      </div>
    </article>
  );
}

function formatRunTime(value) {
  if (!value) {
    return "Recently";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AutoApplyResultRows({ results = [] }) {
  return (
    <div className="auto-apply-result-list">
      {results.map((item, index) => (
        <article key={`${item.jobId}-${item.reason || item.status}-${index}`} className="auto-apply-result-row">
          <div>
            <strong>{item.title}</strong>
            <p>{item.companyName || "Company"}</p>
          </div>
          <div className="list-row__meta">
            <span className={item.status === "applied" ? "pill accent" : "pill"}>
              {item.status === "applied" ? "Applied" : item.reason || "Skipped"}
            </span>
            {item.score !== undefined ? (
              <span className="score-chip">Score {item.score}</span>
            ) : null}
          </div>
        </article>
      ))}
      {!results.length ? (
        <p>No matching jobs were checked. Review readiness and hidden roles.</p>
      ) : null}
    </div>
  );
}

function getMatchQuality(score = 0) {
  const normalizedScore = Number(score) || 0;

  if (normalizedScore >= 80) {
    return "Strong";
  }

  if (normalizedScore >= 60) {
    return "Good";
  }

  if (normalizedScore >= 40) {
    return "Moderate";
  }

  return "Low";
}

export function ProToolsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedJobId, setSelectedJobId] = useState(searchParams.get("jobId") || "");
  const [targetJobSearch, setTargetJobSearch] = useState(searchParams.get("q") || "");
  const [autoApplyForm, setAutoApplyForm] = useState({
    enabled: false,
    tailoredResume: false,
    matchThreshold: 70,
    maxDailyApplications: 10,
    preferredLocations: "",
    excludedCompanies: "",
  });

  useEffect(() => {
    const jobId = searchParams.get("jobId") || "";
    const query = searchParams.get("q") || "";

    if (jobId) {
      setSelectedJobId(jobId);
    }

    if (query) {
      setTargetJobSearch(query);
    }
  }, [searchParams]);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const recommendationsQuery = useQuery({
    queryKey: ["pro-tools", "recommendations"],
    queryFn: () =>
      apiRequest("/recommendations/jobs", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker" && session?.isPro),
  });

  const targetJobsQuery = useQuery({
    queryKey: ["pro-tools", "target-jobs", targetJobSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });

      if (targetJobSearch.trim()) {
        params.set("q", targetJobSearch.trim());
      }

      return apiRequest(`/search/jobs?${params.toString()}`, {
        token: session.accessToken,
      });
    },
    enabled: Boolean(session?.accessToken && session?.role === "seeker" && session?.isPro),
  });

  const autoApplyQuery = useQuery({
    queryKey: ["pro-tools", "auto-apply"],
    queryFn: () =>
      apiRequest("/pro/auto-apply/preferences", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker" && session?.isPro),
  });

  const autoApplyRunsQuery = useQuery({
    queryKey: ["pro-tools", "auto-apply-runs"],
    queryFn: () =>
      apiRequest("/pro/auto-apply/runs", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker" && session?.isPro),
  });

  const recommendedJobs = recommendationsQuery.data?.jobs || [];
  const searchedJobs = targetJobsQuery.data?.jobs || [];
  const jobs = useMemo(() => {
    const byId = new Map();

    [...recommendedJobs, ...searchedJobs].forEach((job) => {
      if (job?._id && !byId.has(job._id)) {
        byId.set(job._id, job);
      }
    });

    return [...byId.values()];
  }, [recommendedJobs, searchedJobs]);
  const selectedJob = jobs.find((job) => job._id === selectedJobId) || jobs[0] || null;

  useMemo(() => {
    const preferences = autoApplyQuery.data?.preferences;

    if (!preferences) {
      return null;
    }

    setAutoApplyForm({
      enabled: Boolean(preferences.enabled),
      tailoredResume: Boolean(preferences.tailoredResume),
      matchThreshold: preferences.matchThreshold ?? 70,
      maxDailyApplications: preferences.maxDailyApplications ?? 10,
      preferredLocations: (preferences.preferredLocations || []).join(", "),
      excludedCompanies: (preferences.excludedCompanies || []).join(", "),
    });

    return null;
  }, [autoApplyQuery.data]);

  const preApplyMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/pro/jobs/${jobId}/pre-apply-check`, {
        method: "POST",
        token: session.accessToken,
      }),
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/pro/jobs/${jobId}/generate-resume`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setFeedback({
        type: "success",
        message: response.readinessWarning || response.message || "Resume generated successfully.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const resumePdfMutation = useMutation({
    mutationFn: async (jobId) => {
      const result = await apiBlobRequest(`/pro/jobs/${jobId}/generate-resume/pdf`, {
        method: "POST",
        token: session.accessToken,
      });
      return result;
    },
    onSuccess: async ({ blob, fileName, contentType }) => {
      const looksLikePdf = contentType.toLowerCase().includes("application/pdf") || await isPdfBlob(blob);

      if (!looksLikePdf) {
        setFeedback({
          type: "error",
          message: "The server did not return a valid PDF. Please restart the backend and try Download PDF again.",
        });
        return;
      }

      const pdfFileName = String(fileName || "sgetai-resume.pdf").replace(/\.[^.]+$/, ".pdf");
      downloadBlob(pdfFileName, blob);
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const autoApplyMutation = useMutation({
    mutationFn: () =>
      apiRequest("/pro/auto-apply/preferences", {
        method: "PUT",
        token: session.accessToken,
        body: {
          enabled: autoApplyForm.enabled,
          tailoredResume: autoApplyForm.tailoredResume,
          preferredLocations: autoApplyForm.preferredLocations
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          excludedCompanies: autoApplyForm.excludedCompanies
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (response) => {
      const wasEnabledBeforeSave = Boolean(autoApplyQuery.data?.preferences?.enabled);
      const justEnabled = autoApplyForm.enabled && !wasEnabledBeforeSave;

      setFeedback({
        type: "success",
        message: justEnabled
          ? "Auto-apply enabled. A background scan has started for active matching jobs."
          : response.message || "Preferences updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply"] });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply-runs"] });
      queryClient.invalidateQueries({ queryKey: ["pro", "auto-apply"] });
      queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      if (justEnabled) {
        window.setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply"] });
          queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply-runs"] });
          queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }, 2500);
      }
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const autoApplyTestMutation = useMutation({
    mutationFn: () =>
      apiRequest("/pro/auto-apply/test-run", {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "Auto-apply test completed.",
      });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply"] });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply-runs"] });
      queryClient.invalidateQueries({ queryKey: ["pro", "auto-apply"] });
      queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (session?.role !== "seeker" || !session?.isPro) {
    return (
      <section className="info-card">
        <h3>Pro tools unavailable</h3>
        <p>This workspace is only available for Pro seeker accounts.</p>
      </section>
    );
  }

  const preApplyResult = preApplyMutation.data?.result;
  const preApplyQuality = getMatchQuality(preApplyResult?.score);
  const autoApplyCountToday = autoApplyQuery.data?.autoApplyCountToday ?? 0;
  const hiddenRoles = autoApplyQuery.data?.hiddenRoles || [];
  const readiness = autoApplyQuery.data?.readiness || {};
  const autoApplyTestResult = autoApplyTestMutation.data?.result;
  const autoApplyRuns = autoApplyRunsQuery.data?.runs || [];

  function handleAutoApplyChange(field, value) {
    setAutoApplyForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8" style={{ background: "#f8f9fa" }}>
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border p-6 lg:p-8" style={{ borderColor: "#e0e0e0", background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(168, 85, 247, 0.08), transparent)" }}>
        <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full blur-3xl" style={{ background: "rgba(59, 130, 246, 0.1)" }}></div>
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(168, 85, 247, 0.12)" }}></div>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Career Copilot</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl text-gray-900">Generate anything for your search</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600 lg:text-base">Resumes, posts, recruiter DMs, cold emails — drafted in seconds and tuned to you.</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column - Tools & History */}
        <section className="col-span-12 space-y-5 lg:col-span-7">
          {/* Quick Tools */}
          <div className="relative rounded-2xl border border-gray-200 bg-white backdrop-blur-xl p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">Quick tools</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-gray-900">What do you want to build?</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button onClick={() => console.log("Resume")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">📄</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">Tailored resume</p><span className="text-xs rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-gray-700">Most used</span></div>
                  <p className="mt-0.5 text-xs text-gray-600">Paste a JD → get a resume tuned to it.</p>
                </div>
              </button>
              <button onClick={() => console.log("LinkedIn")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">💼</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">LinkedIn post</p><span className="text-xs rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-gray-700">Daily</span></div>
                  <p className="mt-0.5 text-xs text-gray-600">Draft a post that gets reach.</p>
                </div>
              </button>
              <button onClick={() => console.log("DM")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">💬</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">Recruiter DM</p><span className="text-xs rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-gray-700">Pro</span></div>
                  <p className="mt-0.5 text-xs text-gray-600">Warm, personalized outreach in 1 click.</p>
                </div>
              </button>
              <button onClick={() => console.log("Email")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">📧</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">Cold email</p><span className="text-xs rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-gray-700">Pro</span></div>
                  <p className="mt-0.5 text-xs text-gray-600">Multi-step sequence to hiring managers.</p>
                </div>
              </button>
              <button onClick={() => console.log("Fit")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">🎯</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">JD-to-profile fit</p><span className="text-xs rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-gray-700">AI</span></div>
                  <p className="mt-0.5 text-xs text-gray-600">Score any job against your profile.</p>
                </div>
              </button>
              <button onClick={() => console.log("Cover")} className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 hover:shadow-elegant">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-purple-500 to-blue-500 text-white shadow-pro">🔍</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="font-semibold text-gray-900">Cover letter</p></div>
                  <p className="mt-0.5 text-xs text-gray-600">Match tone, company values, and JD.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Recently Generated */}
          <div className="relative rounded-2xl border border-gray-200 bg-white backdrop-blur-xl p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">Recently generated</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-gray-900">Your artifacts</h2>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition">
                <span className="text-lg">✨</span>
                <p className="flex-1 truncate text-sm font-medium text-gray-900">Resume — Linear Senior FE</p>
                <span className="text-xs rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-700">Resume</span>
                <span className="text-xs text-gray-600">12m ago</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition">
                <span className="text-lg">✨</span>
                <p className="flex-1 truncate text-sm font-medium text-gray-900">DM — Priya Sharma (Stripe)</p>
                <span className="text-xs rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-700">Message</span>
                <span className="text-xs text-gray-600">1h ago</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition">
                <span className="text-lg">✨</span>
                <p className="flex-1 truncate text-sm font-medium text-gray-900">LinkedIn post — shipping wins</p>
                <span className="text-xs rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-700">Post</span>
                <span className="text-xs text-gray-600">yesterday</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition">
                <span className="text-lg">✨</span>
                <p className="flex-1 truncate text-sm font-medium text-gray-900">Cover letter — Anthropic</p>
                <span className="text-xs rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-700">Letter</span>
                <span className="text-xs text-gray-600">2d ago</span>
              </div>
            </div>
          </div>

          {/* Learning & Course Recommendations */}
          <div className="relative rounded-2xl border border-gray-200 bg-white backdrop-blur-xl p-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">Recommended for you</p>
              <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-gray-900">Level up your skills</h2>
              <p className="mt-1 text-xs text-gray-600">AI-picked courses to match your career goals</p>
            </div>
            <div className="space-y-3">
              <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 transition cursor-pointer">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏗️</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm">System Design for Senior Engineers</h3>
                    <p className="text-xs text-gray-600 mt-0.5">AlgoExpert</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>⏱ 12h</span>
                      <span>📊 Advanced</span>
                      <span>62% complete</span>
                    </div>
                  </div>
                  <button className="shrink-0 rounded-full bg-linear-to-br from-purple-500 to-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-pro hover:shadow-lg transition">Continue</button>
                </div>
              </div>

              <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 transition cursor-pointer">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🧬</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm">Advanced TypeScript Patterns</h3>
                    <p className="text-xs text-gray-600 mt-0.5">Total TypeScript</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>⏱ 8h</span>
                      <span>📊 Advanced</span>
                      <span>24% complete</span>
                    </div>
                  </div>
                  <button className="shrink-0 rounded-full bg-linear-to-br from-purple-500 to-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-pro hover:shadow-lg transition">Continue</button>
                </div>
              </div>

              <div className="text-center mt-4">
                <a href="/pro/learn" className="inline-flex items-center gap-2 text-xs font-semibold text-blue-500 hover:text-blue-600 transition">
                  View all courses →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column - Career Copilot */}
        <aside className="col-span-12 lg:col-span-5">
          <div className="flex h-auto flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-2xl text-white bg-linear-to-br from-purple-500 to-blue-500">🤖</div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 leading-tight">Career Copilot</h2>
                <p className="text-xs text-gray-600 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>Online · Pro automation enabled</p>
              </div>
              <span className="text-xs rounded-full px-2.5 py-1 text-white font-semibold bg-linear-to-br from-purple-500 to-blue-500">✨ Pro</span>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex justify-start">
                <div className="max-w-xs rounded-2xl px-4 py-3 text-sm leading-relaxed text-gray-900 bg-gray-50 border border-gray-200">Morning, Alex 👋 Which job are we grabbing today? I can tailor a resume, draft a LinkedIn post, or match you with new openings.</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 border-t border-gray-200 px-5 py-3">
              <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">📄 Tailor my resume</button>
              <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">💼 Draft a LinkedIn post</button>
              <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">🎯 Match jobs to me</button>
              <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">💬 Write recruiter DM</button>
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-1 focus-within:bg-gray-50">
                <input placeholder="Paste a JD, ask for a post, or describe your goal…" className="flex-1 bg-transparent py-2.5 text-sm outline-none text-gray-900 placeholder:text-gray-400" />
                <button className="grid h-9 w-9 place-items-center rounded-full transition hover:opacity-90 text-white bg-linear-to-br from-purple-500 to-blue-500">➤</button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
