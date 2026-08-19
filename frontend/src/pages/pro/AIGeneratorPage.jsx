import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";

// STYLING APPROACH — scoped global CSS (`.ai-gen ...` in styles.css), the same approach the Pro
// seeker home uses, and for the same two reasons: Tailwind's semantic colour utilities generate
// no CSS in this app (index.css wires fonts only into @theme), and styles.css's unlayered
// `button { ... }` rule outranks any Tailwind utility placed on a <button> — which is what the
// inline `ghostPillStyle` in this file used to work around. Colours come from the shared --ph-*
// palette now declared at :root, so this page and .pro-home cannot drift.

const MIN_JD_TEXT_LENGTH = 40;
const MIN_TOPIC_TEXT_LENGTH = 10;
// A pasted job description is typically much longer than a normal chat message, so treat a
// long paste as an implicit "tailor my resume" request even if the quick-action wasn't clicked.
const LIKELY_JD_TEXT_LENGTH = 150;
// Roughly 6-8 lines of text before the chat input switches to internal scrolling.
const CHAT_INPUT_MAX_HEIGHT_PX = 160;

const ICON_PATHS = {
  "file-text": (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
  "message-square": (
    <>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M7 11h10" />
      <path d="M7 15h6" />
      <path d="M7 7h8" />
    </>
  ),
  mail: (
    <>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </>
  ),
  "file-pen": (
    <>
      <path d="M12.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v3.5" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M21.378 15.626a1 1 0 1 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  bot: (
    <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>
  ),
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
  wand: (
    <>
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
      <circle cx="4" cy="20" r="2" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
};

function Icon({ name, className = "ai-icon" }) {
  const paths = ICON_PATHS[name];

  if (!paths) {
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

// TOOL COVERAGE — every enabled card below is wired to an endpoint that exists and works today.
//
//   Tailored resume  -> POST /pro/agent/tailor-resume-pdf
//   LinkedIn post    -> POST /pro/agent/linkedin-post
//   Recruiter DM     -> POST /pro/agent/recruiter-dm
//   Job match        -> POST /pro/agent/match-jobs
//
// The reference's sixth tool, "JD-to-profile fit — score any job against your profile", is NOT
// offered as described. The only scoring endpoint that takes a specific job is
// POST /pro/jobs/:jobId/pre-apply-check, which needs a real jobId; it cannot score arbitrary
// pasted text, and there is no freeform-JD variant. Rather than wire a control that would have to
// lie about what it accepts, that slot is the job-match tool, described as what match-jobs
// actually does: score this profile against live openings.
//
// Cold email and Cover letter have NO backend at all — no route, no service — and
// GeneratedArtifact.type is enum ["resume","linkedin_post","recruiter_dm","job_matches"], so
// neither could even be stored. They render as visibly unavailable, with no click handler.
const TOOLS = [
  {
    id: "resume",
    icon: "file-text",
    title: "Tailored resume",
    badge: "Most used",
    description: "Paste a JD and get a resume focused on it.",
    action: "Tailor my resume",
  },
  {
    id: "linkedin-post",
    icon: "linkedin",
    title: "LinkedIn post",
    badge: "Daily",
    description: "Polished posts for your network.",
    action: "Draft a LinkedIn post",
  },
  {
    id: "recruiter-dm",
    icon: "message-square",
    title: "Recruiter DM",
    badge: "Pro",
    description: "Warm, personalised outreach.",
    action: "Write recruiter DM",
  },
  {
    id: "job-match",
    icon: "target",
    title: "Job match analysis",
    badge: "AI",
    description: "Score your profile against live openings.",
    action: "Match jobs to me",
  },
  {
    id: "cold-email",
    icon: "mail",
    title: "Cold email",
    description: "Intro emails to hiring managers.",
    unavailable: true,
  },
  {
    id: "cover-letter",
    icon: "file-pen",
    title: "Cover letter",
    description: "Concise, on-brand, role-specific.",
    unavailable: true,
  },
];

const QUICK_ACTIONS = [
  { icon: "file-text", label: "Tailor my resume" },
  { icon: "linkedin", label: "Draft a LinkedIn post" },
  { icon: "target", label: "Match jobs to me" },
  { icon: "message-square", label: "Write recruiter DM" },
];

// Only the four types GeneratedArtifact.type can actually hold. There is deliberately no "Letter"
// label — the enum cannot store one, so a pill for it would describe a row that can never exist.
const ARTIFACT_TYPE_LABELS = {
  resume: "Resume",
  linkedin_post: "Post",
  recruiter_dm: "DM",
  job_matches: "Matches",
};

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
    <button type="button" onClick={handleCopy} className="ai-btn ai-btn--chip">
      {copied ? "Copied!" : label}
    </button>
  );
}

function JobMatchList({ matches }) {
  if (!matches.length) {
    return <p className="ai-empty">No active job matches were found right now.</p>;
  }

  return (
    <div className="ai-matches">
      {matches.map((match) => (
        <div key={match.jobId} className="ai-match">
          <div className="ai-match__head">
            <div className="ai-match__info">
              <p className="ai-match__title">{match.title}</p>
              <p className="ai-match__org">
                {match.organization?.companyName || "Company name unavailable"}
                {match.location ? ` · ${match.location}` : ""}
              </p>
            </div>
            <div className="ai-match__scores">
              <span className="ai-pill">{match.score}%</span>
              <span className="ai-pill ai-pill--muted">{match.tag}</span>
            </div>
          </div>
          {match.reasoning?.matchedSkills?.length ? (
            <p className="ai-match__skills">
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
      <a href={artifact.metadata.linkedin.url} target="_blank" rel="noreferrer" className="ai-posted">
        Posted ✓ · View on LinkedIn
      </a>
    ) : (
      <span className="ai-posted">Posted ✓</span>
    );
  }

  // The two-step gate is unchanged: a seeker who has never connected, or whose token lost the
  // posting scope / expired, gets the connect affordance instead of a publish button that would
  // fail server-side with LINKEDIN_NOT_CONNECTED / MISSING_SCOPE / TOKEN_EXPIRED. ALREADY_POSTED
  // is handled by the postedAt branch above.
  if (!linkedinStatus?.connected || !linkedinStatus?.canPost) {
    return (
      <button type="button" onClick={onConnect} className="ai-btn">
        {linkedinStatus?.connected ? "Reconnect LinkedIn to post" : "Connect LinkedIn to post"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPublish(artifact.id)}
      disabled={isPublishing}
      className="ai-btn"
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
    <div className="ai-modal" onClick={onClose} role="presentation">
      <div
        className="ai-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={artifact.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ai-modal__head">
          <h3 className="ai-modal__title">{artifact.title}</h3>
          <button type="button" className="ai-btn ai-btn--icon" onClick={onClose} aria-label="Close preview">
            <Icon name="close" />
          </button>
        </div>

        {artifact.type === "job_matches" ? (
          <JobMatchList matches={artifact.metadata?.matches || []} />
        ) : (
          <>
            <p className="ai-modal__body">{artifact.textContent}</p>
            <div className="ai-modal__actions">
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
            </div>
            {artifact.type === "linkedin_post" && publishError && (
              <p className="ai-error">{publishError}</p>
            )}
          </>
        )}
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
    <main className="ai-gen">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="ai-hero">
        <p className="ai-eyebrow">Career copilot</p>
        <h1 className="ai-hero__title">Generate anything for your search</h1>
        {/* Cold emails are deliberately absent from this line — the page cannot produce one. */}
        <p className="ai-hero__sub">
          Resumes, LinkedIn posts, recruiter DMs and job-match scoring — drafted in seconds and
          tuned to your profile.
        </p>
      </section>

      <div className="ai-split">
        {/* ------------------------------------------------- Left: tools + artifacts */}
        <div className="ai-main">
          <section className="ai-card">
            <div className="ai-card__head">
              <div>
                <p className="ai-eyebrow">Quick tools</p>
                <h2 className="ai-card__title">What do you want to build?</h2>
              </div>
            </div>

            <ul className="ai-tools">
              {TOOLS.map((tool) => (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={`ai-tool${tool.unavailable ? " ai-tool--soon" : ""}`}
                    // Unavailable tools carry BOTH: `disabled` makes them genuinely unclickable
                    // and `aria-disabled` states it explicitly. There is no onClick to fall back
                    // on, so an enabled-looking card can never do nothing.
                    disabled={tool.unavailable}
                    aria-disabled={tool.unavailable ? "true" : undefined}
                    onClick={tool.unavailable ? undefined : quickActionHandlers[tool.action]}
                  >
                    <span className="ai-tile">
                      <Icon name={tool.icon} />
                    </span>
                    <span className="ai-tool__body">
                      <span className="ai-tool__top">
                        <span className="ai-tool__title">{tool.title}</span>
                        {tool.unavailable ? (
                          <span className="ai-pill ai-pill--muted">Coming soon</span>
                        ) : (
                          <span className="ai-pill">{tool.badge}</span>
                        )}
                      </span>
                      <span className="ai-tool__desc">{tool.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="ai-card">
            <div className="ai-card__head">
              <div>
                <p className="ai-eyebrow">Recently generated</p>
                <h2 className="ai-card__title">Your artifacts</h2>
              </div>
              {artifacts.length ? (
                <button
                  type="button"
                  className="ai-btn ai-btn--ghost"
                  onClick={handleDismissAllArtifacts}
                  disabled={dismissAllArtifactsMutation.isPending}
                >
                  {dismissAllArtifactsMutation.isPending ? "Closing…" : "Close all"}
                </button>
              ) : null}
            </div>

            {artifacts.length ? (
              <ul className="ai-artifacts">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="ai-artifact">
                    <button
                      type="button"
                      className="ai-artifact__open"
                      onClick={() => handleArtifactClick(artifact)}
                    >
                      <span className="ai-artifact__spark">
                        <Icon name="sparkles" className="ai-icon ai-icon--sm" />
                      </span>
                      <span className="ai-artifact__body">
                        <span className="ai-artifact__title">{artifact.title}</span>
                        <span className="ai-artifact__meta">
                          <span className="ai-pill ai-pill--muted">
                            {ARTIFACT_TYPE_LABELS[artifact.type] || artifact.type}
                          </span>
                          <span className="ai-artifact__time">
                            {formatRelativeTime(artifact.createdAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ai-btn ai-btn--icon"
                      onClick={(event) => handleDismissArtifact(event, artifact.id)}
                      aria-label={`Dismiss ${artifact.title}`}
                      title="Dismiss"
                      disabled={dismissArtifactMutation.isPending}
                    >
                      <Icon name="close" className="ai-icon ai-icon--sm" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ai-empty">
                {artifactsQuery.isLoading
                  ? "Loading your generated artifacts…"
                  : "Nothing generated yet — pick a tool above to get started."}
              </p>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------- Right: Copilot */}
        <section className="ai-card ai-copilot" aria-label="Career Copilot">
          <div className="ai-copilot__head">
            <span className="ai-tile">
              <Icon name="bot" />
            </span>
            <div className="ai-copilot__identity">
              <h2 className="ai-copilot__name">Career Copilot</h2>
              <p className="ai-status">
                <span className="ai-status__dot" aria-hidden="true" />
                {/* The word carries the state; the dot only reinforces it. */}
                Online · Pro automation enabled
              </p>
            </div>
            <span className="ai-pill">
              <span aria-hidden="true">✨</span> Pro
            </span>
          </div>

          <div
            className="ai-chat"
            role="log"
            aria-live="polite"
            aria-label="Conversation with Career Copilot"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`ai-msg ${msg.role === "user" ? "ai-msg--user" : "ai-msg--assistant"}`}
              >
                <div className="ai-msg__bubble">
                  <p className="ai-msg__text">{msg.content}</p>
                  {msg.kind === "job-matches" ? <JobMatchList matches={msg.matches} /> : null}
                  {msg.kind === "copyable" ? <CopyButton text={msg.content} label={msg.copyLabel} /> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="ai-chips">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="ai-btn ai-btn--chip"
                disabled={isAnyMutationPending}
                onClick={quickActionHandlers[action.label]}
              >
                <Icon name={action.icon} className="ai-icon ai-icon--sm" />
                {action.label}
              </button>
            ))}
          </div>

          <div className="ai-composer">
            <label className="ai-sr-only" htmlFor="ai-composer-input">
              Message Career Copilot
            </label>
            <div className="ai-composer__field">
              <Icon name="wand" className="ai-icon ai-icon--sm" />
              <textarea
                id="ai-composer-input"
                ref={chatInputRef}
                rows={1}
                className="ai-composer__input"
                placeholder={inputPlaceholders[activeIntent] || inputPlaceholders.default}
                value={inputValue}
                disabled={isAnyMutationPending}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  resizeChatInput();
                }}
                onKeyDown={handleChatInputKeyDown}
              />
              <button
                type="button"
                className="ai-btn ai-btn--send"
                onClick={handleSendMessage}
                disabled={isAnyMutationPending}
                aria-label="Send message"
              >
                <Icon name="send" className="ai-icon ai-icon--sm" />
              </button>
            </div>
          </div>
        </section>
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
