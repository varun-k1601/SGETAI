import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";

const MIN_JD_TEXT_LENGTH = 40;
const MIN_TOPIC_TEXT_LENGTH = 10;
// A pasted job description is typically much longer than a normal chat message, so treat a
// long paste as an implicit "tailor my resume" request even if the quick-action wasn't clicked.
const LIKELY_JD_TEXT_LENGTH = 150;
// Roughly 6-8 lines of text before the chat input switches to internal scrolling.
const CHAT_INPUT_MAX_HEIGHT_PX = 160;

function looksLikeJobDescription(text) {
  return text.trim().length >= LIKELY_JD_TEXT_LENGTH;
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

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "yesterday";
  }

  return `${diffDays}d ago`;
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Clipboard API may be unavailable (e.g. non-secure context) — nothing else to do here.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-2.5 py-1 text-xs font-medium hover:bg-surface"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function JobMatchList({ matches }) {
  if (!matches.length) {
    return <p className="mt-2 text-xs text-muted-foreground">No active job matches were found right now.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {matches.map((match) => (
        <div key={match.jobId} className="rounded-xl border border-border/40 bg-surface/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{match.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {match.organization?.companyName || "Company name unavailable"}
                {match.location ? ` · ${match.location}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                {match.score}%
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                {match.tag}
              </span>
            </div>
          </div>
          {match.reasoning?.matchedSkills?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Matched: {match.reasoning.matchedSkills.slice(0, 5).join(", ")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PostToLinkedInButton({ artifact, linkedinStatus, onPublish, isPublishing, onConnect }) {
  const alreadyPosted = artifact.metadata?.linkedin?.postedAt;

  if (alreadyPosted) {
    return artifact.metadata.linkedin.url ? (
      <a
        href={artifact.metadata.linkedin.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-2.5 py-1 text-xs font-medium text-success"
      >
        Posted ✓ · View on LinkedIn
      </a>
    ) : (
      <span className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
        Posted ✓
      </span>
    );
  }

  // This app's global `button { background, border-radius, padding, border, box-shadow, color,
  // transform, transition }` rule in styles.css is unlayered, so it silently wins over any
  // Tailwind utility class applied directly to a <button> (see AutomationSection.jsx's
  // FeatureToggle for the original diagnosis) — the pre-existing CopyButton just above this one
  // on this same page is a live example of the resulting bug. Resetting those specific
  // properties inline is the established workaround; layout classes are unaffected.
  const ghostPillStyle = {
    border: "1px solid var(--border)",
    borderRadius: "9999px",
    background: "var(--surface-muted)",
    boxShadow: "none",
    color: "inherit",
    fontWeight: 500,
    padding: "0.25rem 0.625rem",
    transform: "none",
    transition: "none",
  };

  if (!linkedinStatus?.connected || !linkedinStatus?.canPost) {
    return (
      <button
        type="button"
        onClick={onConnect}
        style={ghostPillStyle}
        className="mt-2 ml-2 inline-flex items-center gap-1.5 text-xs"
      >
        {linkedinStatus?.connected ? "Reconnect LinkedIn to post" : "Connect LinkedIn to post"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPublish(artifact.id)}
      disabled={isPublishing}
      style={{ ...ghostPillStyle, opacity: isPublishing ? 0.6 : 1, cursor: isPublishing ? "not-allowed" : "pointer" }}
      className="mt-2 ml-2 inline-flex items-center gap-1.5 text-xs"
    >
      {isPublishing ? "Posting…" : "Post to LinkedIn"}
    </button>
  );
}

function ArtifactPreviewModal({ artifact, onClose, linkedinStatus, onPublish, isPublishing, publishError, onConnect }) {
  if (!artifact) {
    return null;
  }

  const copyLabel = artifact.type === "linkedin_post" ? "Copy post" : "Copy message";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{artifact.title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-content">
          {artifact.type === "job_matches" ? (
            <JobMatchList matches={artifact.metadata?.matches || []} />
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{artifact.textContent}</p>
              <CopyButton text={artifact.textContent || ""} label={copyLabel} />
              {artifact.type === "linkedin_post" && (
                <PostToLinkedInButton
                  artifact={artifact}
                  linkedinStatus={linkedinStatus}
                  onPublish={onPublish}
                  isPublishing={isPublishing}
                  onConnect={onConnect}
                />
              )}
              {artifact.type === "linkedin_post" && publishError && (
                <p className="mt-2 text-xs text-red-500">{publishError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIGeneratorPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const chatInputRef = useRef(null);
  const [activeIntent, setActiveIntent] = useState(null);
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const firstName = session?.profile?.firstName?.trim() || "there";
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Morning, ${firstName} 👋 Which job are we grabbing today? I can tailor a resume, draft a LinkedIn post, or match you with new openings.`
    }
  ]);

  const artifactsQuery = useQuery({
    queryKey: ["career-copilot", "artifacts"],
    queryFn: () => apiRequest("/pro/agent/artifacts", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });
  const artifacts = artifactsQuery.data?.artifacts || [];

  const linkedinStatusQuery = useQuery({
    queryKey: ["pro", "linkedin-status"],
    queryFn: () => apiRequest("/pro/linkedin/status", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  const [publishError, setPublishError] = useState("");

  const dismissArtifactMutation = useMutation({
    mutationFn: (artifactId) =>
      apiRequest(`/pro/agent/artifacts/${artifactId}/dismiss`, {
        method: "PATCH",
        token: session.accessToken
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-copilot", "artifacts"] });
    }
  });

  const dismissAllArtifactsMutation = useMutation({
    mutationFn: () =>
      apiRequest("/pro/agent/artifacts/dismiss-all", {
        method: "PATCH",
        token: session.accessToken
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-copilot", "artifacts"] });
    }
  });

  function handleDismissArtifact(event, artifactId) {
    event.stopPropagation();
    dismissArtifactMutation.mutate(artifactId);
  }

  function handleDismissAllArtifacts() {
    if (!window.confirm("Close all generated artifacts? Your resumes, posts, and messages will still be saved — this only clears them from this list.")) {
      return;
    }
    dismissAllArtifactsMutation.mutate();
  }

  const publishLinkedInPostMutation = useMutation({
    mutationFn: (artifactId) =>
      apiRequest(`/pro/linkedin/posts/${artifactId}/publish`, {
        method: "POST",
        token: session.accessToken
      }),
    onSuccess: (response, artifactId) => {
      setPublishError("");
      const linkedinMeta = { postedAt: new Date().toISOString(), urn: response.urn, url: response.url };
      setSelectedArtifact((current) =>
        current && current.id === artifactId
          ? { ...current, metadata: { ...current.metadata, linkedin: linkedinMeta } }
          : current
      );
      queryClient.invalidateQueries({ queryKey: ["career-copilot", "artifacts"] });
    },
    onError: (error) => {
      setPublishError(error.message || "Something went wrong while posting to LinkedIn.");
    }
  });

  function handleConnectLinkedIn() {
    window.location.href = `${API_BASE_URL}/pro/linkedin/connect?token=${encodeURIComponent(session.accessToken)}`;
  }

  function handlePublishToLinkedIn(artifactId) {
    setPublishError("");
    publishLinkedInPostMutation.mutate(artifactId);
  }

  function refreshArtifacts() {
    queryClient.invalidateQueries({ queryKey: ["career-copilot", "artifacts"] });
  }

  // The backend persists artifacts fire-and-forget (after the user-facing response is already
  // sent) so a storage hiccup never blocks the PDF download / chat reply. That means the record
  // may not exist yet the instant we get a successful response back, so refetch once immediately
  // and once again shortly after to pick it up once the background write lands.
  function refreshArtifactsSoon(delayMs = 1200) {
    refreshArtifacts();
    setTimeout(refreshArtifacts, delayMs);
  }

  const tailorResumeMutation = useMutation({
    mutationFn: (jobDescription) =>
      apiBlobRequest("/pro/agent/tailor-resume-pdf", {
        method: "POST",
        token: session.accessToken,
        body: { jobDescription }
      })
  });

  const matchJobsMutation = useMutation({
    mutationFn: (limit) =>
      apiRequest("/pro/agent/match-jobs", {
        method: "POST",
        token: session.accessToken,
        body: limit ? { limit } : {}
      })
  });

  const linkedInPostMutation = useMutation({
    mutationFn: (topic) =>
      apiRequest("/pro/agent/linkedin-post", {
        method: "POST",
        token: session.accessToken,
        body: { topic }
      })
  });

  const recruiterDmMutation = useMutation({
    mutationFn: (context) =>
      apiRequest("/pro/agent/recruiter-dm", {
        method: "POST",
        token: session.accessToken,
        body: { context }
      })
  });

  const isAnyMutationPending =
    tailorResumeMutation.isPending ||
    matchJobsMutation.isPending ||
    linkedInPostMutation.isPending ||
    recruiterDmMutation.isPending;

  const features = [
    {
      icon: "file-text",
      title: "Tailor my resume",
      description: "Paste a JD, get a focused resume."
    },
    {
      icon: "linkedin",
      title: "LinkedIn post",
      description: "Polished posts for your network."
    },
    {
      icon: "message-square",
      title: "Recruiter DM",
      description: "Warm, personalized outreach."
    },
    {
      icon: "mail",
      title: "Cover letter",
      description: "Concise, on-brand, role-specific."
    },
    {
      icon: "target",
      title: "Job match analysis",
      description: "Score and tailor your profile."
    }
  ];

  const quickActions = [
    { icon: "file-text", label: "Tailor my resume" },
    { icon: "linkedin", label: "Draft a LinkedIn post" },
    { icon: "target", label: "Match jobs to me" },
    { icon: "message-square", label: "Write recruiter DM" }
  ];

  const getIconSvg = (iconName) => {
    const icons = {
      "file-text": (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>
          <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
          <path d="M10 9H8"></path>
          <path d="M16 13H8"></path>
          <path d="M16 17H8"></path>
        </svg>
      ),
      linkedin: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
          <rect width="4" height="12" x="2" y="9"></rect>
          <circle cx="4" cy="4" r="2"></circle>
        </svg>
      ),
      "message-square": (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
          <path d="M7 11h10"></path>
          <path d="M7 15h6"></path>
          <path d="M7 7h8"></path>
        </svg>
      ),
      mail: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
          <rect x="2" y="4" width="20" height="16" rx="2"></rect>
        </svg>
      ),
      target: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="6"></circle>
          <circle cx="12" cy="12" r="2"></circle>
        </svg>
      ),
      bot: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M12 8V4H8"></path>
          <rect width="16" height="12" x="4" y="8" rx="2"></rect>
          <path d="M2 14h2"></path>
          <path d="M20 14h2"></path>
          <path d="M15 13v2"></path>
          <path d="M9 13v2"></path>
        </svg>
      ),
      send: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
          <path d="m21.854 2.147-10.94 10.939"></path>
        </svg>
      ),
      wand: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"></path>
          <path d="m14 7 3 3"></path>
          <path d="M5 6v4"></path>
          <path d="M19 14v4"></path>
          <path d="M10 2v2"></path>
          <path d="M7 8H3"></path>
          <path d="M21 16h-4"></path>
          <path d="M11 3H9"></path>
        </svg>
      ),
      sparkles: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
          <path d="M20 2v4"></path>
          <path d="M22 4h-4"></path>
          <circle cx="4" cy="20" r="2"></circle>
        </svg>
      )
    };
    return icons[iconName] || null;
  };

  function pushMessage(message) {
    setMessages((current) => [...current, message]);
  }

  function replaceLastMessage(message) {
    setMessages((current) => [...current.slice(0, -1), message]);
  }

  async function runTailorResume(jobDescription) {
    if (jobDescription.length < MIN_JD_TEXT_LENGTH) {
      pushMessage({
        role: "assistant",
        content: `Please paste a more complete job description (at least ${MIN_JD_TEXT_LENGTH} characters) so I can tailor your resume accurately.`
      });
      return;
    }

    pushMessage({ role: "assistant", content: "Tailoring your resume for this role using only your profile data…" });

    try {
      const { blob, fileName, contentType } = await tailorResumeMutation.mutateAsync(jobDescription);
      const looksLikePdf = contentType.toLowerCase().includes("application/pdf") || (await isPdfBlob(blob));

      if (!looksLikePdf) {
        throw new Error("The server did not return a valid PDF. Please try again.");
      }

      const pdfFileName = String(fileName || "tailored-resume.pdf").replace(/\.[^.]+$/, ".pdf");
      downloadBlob(pdfFileName, blob);

      replaceLastMessage({ role: "assistant", content: "Here's your tailored resume for this role — it should be downloading now." });
      refreshArtifactsSoon(2000);
    } catch (error) {
      replaceLastMessage({ role: "assistant", content: error.message || "Something went wrong while tailoring your resume. Please try again." });
    }
  }

  async function runMatchJobs(rawInput) {
    const parsedLimit = Number.parseInt(rawInput, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

    pushMessage({ role: "assistant", content: "Finding your best-fit roles…" });

    try {
      const response = await matchJobsMutation.mutateAsync(limit);
      const matches = response.matches || [];

      replaceLastMessage({
        role: "assistant",
        kind: "job-matches",
        content: matches.length
          ? "Here are your best-fit active roles right now, ranked by match score:"
          : "I couldn't find any active job matches for your profile right now.",
        matches
      });

      if (matches.length) {
        refreshArtifactsSoon();
      }
    } catch (error) {
      replaceLastMessage({ role: "assistant", content: error.message || "Something went wrong while finding job matches. Please try again." });
    }
  }

  async function runLinkedInPost(topic) {
    if (topic.length < MIN_TOPIC_TEXT_LENGTH) {
      pushMessage({
        role: "assistant",
        content: `Tell me a bit more about what the post should be about (at least ${MIN_TOPIC_TEXT_LENGTH} characters).`
      });
      return;
    }

    pushMessage({ role: "assistant", content: "Drafting your LinkedIn post…" });

    try {
      const response = await linkedInPostMutation.mutateAsync(topic);
      replaceLastMessage({ role: "assistant", kind: "copyable", content: response.post, copyLabel: "Copy post" });
      refreshArtifactsSoon();
    } catch (error) {
      replaceLastMessage({ role: "assistant", content: error.message || "Something went wrong while drafting your LinkedIn post. Please try again." });
    }
  }

  async function runRecruiterDm(context) {
    if (context.length < MIN_TOPIC_TEXT_LENGTH) {
      pushMessage({
        role: "assistant",
        content: `Tell me a bit more about who you're reaching out to and why (at least ${MIN_TOPIC_TEXT_LENGTH} characters).`
      });
      return;
    }

    pushMessage({ role: "assistant", content: "Writing your recruiter DM…" });

    try {
      const response = await recruiterDmMutation.mutateAsync(context);
      replaceLastMessage({ role: "assistant", kind: "copyable", content: response.dmMessage, copyLabel: "Copy message" });
      refreshArtifactsSoon();
    } catch (error) {
      replaceLastMessage({ role: "assistant", content: error.message || "Something went wrong while writing your recruiter DM. Please try again." });
    }
  }

  function resizeChatInput() {
    const textarea = chatInputRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX)}px`;
  }

  function handleChatInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  async function handleSendMessage() {
    const trimmed = inputValue.trim();

    if (!trimmed || isAnyMutationPending) {
      return;
    }

    const intent = activeIntent;

    pushMessage({ role: "user", content: trimmed });
    setInputValue("");
    setActiveIntent(null);

    // Clearing state won't retrigger onChange, so reset the grown height directly —
    // "auto" is already correct for empty content, no scrollHeight measurement needed.
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }

    if (intent === "match-jobs") {
      return runMatchJobs(trimmed);
    }

    if (intent === "linkedin-post") {
      return runLinkedInPost(trimmed);
    }

    if (intent === "recruiter-dm") {
      return runRecruiterDm(trimmed);
    }

    if (intent === "tailor-resume" || looksLikeJobDescription(trimmed)) {
      return runTailorResume(trimmed);
    }
  }

  function handleTailorResumeQuickAction() {
    setActiveIntent("tailor-resume");
    pushMessage({ role: "assistant", content: "Paste the full job description below and I'll tailor your resume to it using only your profile data." });
  }

  function handleMatchJobsQuickAction() {
    setActiveIntent("match-jobs");
    pushMessage({ role: "assistant", content: "Type anything below (optionally a number for how many roles to show) and I'll pull your best-fit active roles right now." });
  }

  function handleLinkedInPostQuickAction() {
    setActiveIntent("linkedin-post");
    pushMessage({ role: "assistant", content: "What should the LinkedIn post be about? (e.g. a project you shipped, a skill you're building, a lesson learned)" });
  }

  function handleArtifactClick(artifact) {
    if (artifact.type === "resume") {
      if (artifact.fileUrl) {
        window.open(artifact.fileUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setSelectedArtifact(artifact);
  }

  function handleRecruiterDmQuickAction() {
    setActiveIntent("recruiter-dm");
    pushMessage({ role: "assistant", content: "Who are you reaching out to and about what role? (e.g. \"A recruiter at Acme about the Senior FE role\")" });
  }

  const quickActionHandlers = {
    "Tailor my resume": handleTailorResumeQuickAction,
    "Match jobs to me": handleMatchJobsQuickAction,
    "Draft a LinkedIn post": handleLinkedInPostQuickAction,
    "Write recruiter DM": handleRecruiterDmQuickAction
  };

  const inputPlaceholders = {
    default: "Paste a JD, ask for a post, or describe your goal…",
    "tailor-resume": "Paste the job description here…",
    "match-jobs": "Type anything (or a number of roles) to find your matches…",
    "linkedin-post": "What should the post be about?",
    "recruiter-dm": "Who are you reaching out to, and about what role?"
  };

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                AI assistant
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Career Copilot
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Generate tailored resumes, LinkedIn posts, recruiter DMs and more — on demand.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Features */}
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          {features.map((feature) => (
            <div key={feature.title} className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {getIconSvg(feature.icon)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </aside>

        {/* Right Section - Chat Interface */}
        <section className="col-span-12 lg:col-span-8">
          <div className="flex h-[calc(100vh-12rem)] min-h-140 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-elegant">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-subtle p-5">
              <div className="grid h-11 w-11 place-items-center rounded-2xl text-primary-foreground bg-linear-to-r from-purple-500 to-blue-500 shadow-glow">
                {getIconSvg("bot")}
              </div>
              <div className="flex-1">
                <h2 className="font-display text-lg font-semibold leading-tight">Career Copilot</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
                  Online · Free tier
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-secondary text-secondary-foreground">
                {getIconSvg("sparkles")}
                Beta
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} style={{ opacity: 1, transform: "none" }}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "rounded-br-md bg-linear-to-r from-purple-500 to-blue-500 text-white"
                        : "rounded-bl-md border border-border/60 bg-surface"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.kind === "job-matches" ? <JobMatchList matches={msg.matches} /> : null}
                    {msg.kind === "copyable" ? <CopyButton text={msg.content} label={msg.copyLabel} /> : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 border-t border-border/60 px-5 py-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={isAnyMutationPending}
                  onClick={quickActionHandlers[action.label]}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/80 px-3 py-1.5 text-xs font-medium hover:bg-surface hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {getIconSvg(action.icon)}
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-border/60 p-4">
              <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-surface/80 pl-4 pr-1 focus-within:bg-surface focus-within:shadow-elegant">
                <div className="py-2.5">{getIconSvg("wand")}</div>
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  placeholder={inputPlaceholders[activeIntent] || inputPlaceholders.default}
                  value={inputValue}
                  disabled={isAnyMutationPending}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    resizeChatInput();
                  }}
                  onKeyDown={handleChatInputKeyDown}
                  className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isAnyMutationPending}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary-foreground transition hover:opacity-90 bg-linear-to-r from-purple-500 to-blue-500 shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {getIconSvg("send")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Generated Artifacts */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant mt-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Recent
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Generated artifacts
            </h2>
          </div>
          {artifacts.length ? (
            <button
              type="button"
              onClick={handleDismissAllArtifacts}
              disabled={dismissAllArtifactsMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dismissAllArtifactsMutation.isPending ? "Closing…" : "Close all"}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {artifacts.length ? (
            artifacts.map((artifact) => (
              <div
                key={artifact.id}
                onClick={() => handleArtifactClick(artifact)}
                className="relative cursor-pointer rounded-xl border border-border/40 bg-surface/40 p-3 text-left transition hover:bg-surface/70 hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={(event) => handleDismissArtifact(event, artifact.id)}
                  aria-label="Dismiss artifact"
                  title="Dismiss"
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-border/60 bg-surface/80 p-0! text-muted-foreground hover:bg-surface"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </svg>
                </button>
                <p className="pr-6 text-sm font-semibold">{artifact.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                    {formatRelativeTime(artifact.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                    {artifact.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {artifactsQuery.isLoading ? "Loading your generated artifacts…" : "No generated artifacts yet — try one of the quick actions above."}
            </p>
          )}
        </div>
      </div>

      <ArtifactPreviewModal
        artifact={selectedArtifact}
        onClose={() => {
          setSelectedArtifact(null);
          setPublishError("");
        }}
        linkedinStatus={linkedinStatusQuery.data}
        onPublish={handlePublishToLinkedIn}
        isPublishing={publishLinkedInPostMutation.isPending}
        publishError={publishError}
        onConnect={handleConnectLinkedIn}
      />
    </main>
  );
}
