import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { PostCard, actionButtonStyle, pillTriggerStyle } from "../../components/feedPostKit";
import { CompanyLogo } from "../../components/CompanyLogo";

/* ===============================================================================================
   FREE SEEKER HOME (/home when the session is a seeker WITHOUT isPro).
   ===============================================================================================
   Sibling of ProSeekerDashboard, which renders at the same route for Pro. The two are one product
   at two tiers, so this file uses the same shared --ph-* palette and the same card/eyebrow/tile
   primitives, under its own `.free-home` scope in styles.css.

   EVERY NUMBER ON THIS PAGE IS BACKED BY A REAL FIELD. A dashboard figure is a claim about the
   user's account, so the design's invented analytics are deliberately absent rather than
   approximated — see METRICS below for what was dropped and what replaced it.
   =============================================================================================== */

/* THE FOUR METRICS THAT DO NOT EXIST, AND WHAT IS SHOWN INSTEAD.

   1. "Profile views 284 +12%"  -> OMITTED. `profileViews` is not a field on the JobSeeker schema.
      dashboardController reads `seeker.profileViews || 0` from a property that is never defined
      and never incremented, so the honest value is 0 for every user, forever. Implementing it
      needs a schema field, an increment at a real view site with self-views excluded, and stored
      timestamps before any "+12%" could be computed from more than one data point.
   2. "Post impressions 3.2k +38%" -> OMITTED. No impression tracking exists anywhere in the app.
   3. "Search appearances 47"      -> OMITTED. Not tracked.
   4. "Match 87% ↑4"               -> the SCORE is kept, the TREND is dropped. computeCandidateMatch
      gives a real 0-100 per job (recommendationController attaches it as `matchScore`), so the
      best of those is a true figure. There is no historical series, so no "↑4".

   Replaced by four figures that are already fetched by the queries below: applications submitted,
   applications in progress, pending connection requests, and conversations. */

// The REAL Application status enum (backend/src/models/Application.js): Pending, UnderReview,
// Interview, Accepted, Rejected, Withdrawn. Earlier code elsewhere filtered on "Interviewed" and
// "OfferSent", which are not members and therefore always matched nothing.
const APPLICATION_STATUS_LABELS = {
  Pending: "Pending",
  UnderReview: "Under review",
  Interview: "Interview",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn"
};

// "In progress" means the employer has not closed it out. Accepted, Rejected and Withdrawn are
// terminal; the other three are live.
const IN_PROGRESS_STATUSES = new Set(["Pending", "UnderReview", "Interview"]);

const STATUS_TONE = {
  Interview: "nh-pill--good",
  Accepted: "nh-pill--good",
  Rejected: "nh-pill--muted",
  Withdrawn: "nh-pill--muted"
};

function flattenSkillGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => group.skills || [])
    .map((skill) => String(skill).trim())
    .filter(Boolean);
}

/* PROFILE STRENGTH — a mirror of getResumeProfileReadiness
   (backend/src/services/resumeGenerationService.js), not a second scoring scheme.

   It has to be mirrored rather than called: both of that function's HTTP call sites live in
   proFeaturesController behind `requirePro`, so a free seeker — the only kind of user who sees
   this page — cannot reach it. The section definitions below are copied from it exactly:

     REQUIRED   education, skills, projects   (its `missingSections`, what gates a tailored resume)
     TRACKED    objective, experience, certifications, achievements
                (its `profileSectionsUsed`, reported but non-blocking)

   The percentage is over all seven, so the bar moves in sensible steps instead of thirds, and the
   three that actually block resume generation are marked so the candidate knows which matter.
   Keep this list in step with getResumeProfileReadiness if that function changes. */
function computeProfileStrength(profile) {
  const source = profile || {};
  const educationCount =
    (source.education || []).length +
    ([source.degree, source.major, source.universityName].filter(Boolean).length ? 1 : 0);
  const skillCount = [...flattenSkillGroups(source.skillGroups), ...(source.skills || [])].filter(Boolean).length;

  const sections = [
    { key: "education", done: educationCount > 0, required: true, label: "Add your education", to: "/profile?section=education" },
    { key: "skills", done: skillCount > 0, required: true, label: "Add your skills", to: "/profile?section=skills" },
    { key: "projects", done: (source.projects || []).length > 0, required: true, label: "Add a project", to: "/profile?section=portfolio" },
    { key: "objective", done: Boolean(source.careerObjective || source.bio || source.tagline), required: false, label: "Write a career objective", to: "/profile?section=career" },
    { key: "experience", done: (source.experience || []).length > 0, required: false, label: "Add work experience", to: "/profile?section=experience" },
    { key: "certifications", done: (source.licensesAndCertifications || []).length > 0, required: false, label: "Add a certification", to: "/profile?section=portfolio" },
    { key: "achievements", done: (source.achievements || []).length > 0, required: false, label: "Add an achievement", to: "/profile?section=portfolio" }
  ];

  const completedCount = sections.filter((section) => section.done).length;
  return {
    percent: Math.round((completedCount / sections.length) * 100),
    completedCount,
    totalCount: sections.length,
    missing: sections.filter((section) => !section.done)
  };
}

function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Icon({ path, className = "nh-icon" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

const ICONS = {
  sparkle: <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  photo: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.5-4.5L7 20" /></>,
  video: <><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></>
};

export function NormalSeekerDashboard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postFiles, setPostFiles] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  /* "/applications" is not a route — applications.js mounts the seeker list at "/applications/mine"
     (and the `limit` param is ignored by getMyApplications, which returns the full list). This page
     was requesting the bare path and getting a 404 back, which is why the applications card and the
     Apps figure had never once rendered real data. ApplicationsPage.jsx and ProSeekerDashboard.jsx
     both already call the correct path. The query KEY is unchanged, so nothing that invalidates it
     needs to know. */
  const applicationsQuery = useQuery({
    queryKey: ["applications", "dashboard"],
    queryFn: () => apiRequest("/applications/mine", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  // /recommendations/jobs — requireAuth only, NOT Pro-gated, so a free seeker legitimately sees
  // these. Each job carries a real `matchScore` from computeCandidateMatch, the same formula used
  // for ATS and auto-apply scoring, so the percentage means the same thing everywhere it appears.
  const jobsQuery = useQuery({
    queryKey: ["jobs", "recommended"],
    queryFn: () => apiRequest("/recommendations/jobs?limit=10", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  const pendingConnectionsQuery = useQuery({
    queryKey: ["connections", "pending"],
    queryFn: () => apiRequest("/connections/pending", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  const chatSessionsQuery = useQuery({
    queryKey: ["chat", "sessions"],
    queryFn: () => apiRequest("/chat/sessions", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  // The same shared feed ProSeekerDashboard renders — Normal and Pro see one community, not two.
  const feedQuery = useQuery({
    queryKey: ["posts", "feed"],
    queryFn: () => apiRequest("/posts/feed?limit=30", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  const posts = feedQuery.data?.posts || [];

  const createPostMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("content", postContent);
      postFiles.forEach((file) => formData.append("files", file));
      return apiFormRequest("/posts", { method: "POST", token: session.accessToken, formData });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Post published." });
      setPostContent("");
      setPostFiles([]);
      setIsComposerOpen(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message })
  });

  const likePostMutation = useMutation({
    mutationFn: (postId) => apiRequest(`/posts/${postId}/like`, { method: "POST", token: session.accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts", "feed"] }),
    onError: (error) => setFeedback({ type: "error", message: error.message })
  });

  const commentPostMutation = useMutation({
    mutationFn: ({ postId, content }) =>
      apiRequest(`/posts/${postId}/comment`, { method: "POST", token: session.accessToken, body: { content } }),
    onSuccess: (_response, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.postId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message })
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) => apiRequest(`/posts/${postId}`, { method: "DELETE", token: session.accessToken }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Post deleted." });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message })
  });

  function handleDeletePost(postId) {
    if (window.confirm("Delete this post? This can't be undone.")) {
      deletePostMutation.mutate(postId);
    }
  }

  function handleCommentPost(postId) {
    const content = (commentDrafts[postId] || "").trim();
    if (content) commentPostMutation.mutate({ postId, content });
  }

  const profile = session?.profile;
  const firstName = profile?.firstName || "there";
  const lastName = profile?.lastName || "";
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "?";
  const headline = profile?.tagline || profile?.preferredRoles?.[0] || "Job seeker";

  const applications = applicationsQuery.data?.applications || [];
  const jobs = jobsQuery.data?.jobs || [];
  const pendingConnectionsCount = pendingConnectionsQuery.data?.connections?.length ?? 0;
  const chatSessionsCount = chatSessionsQuery.data?.sessions?.length ?? 0;

  const inProgress = useMemo(
    () => applications.filter((application) => IN_PROGRESS_STATUSES.has(application.status)),
    [applications]
  );
  const profileStrength = useMemo(() => computeProfileStrength(profile), [profile]);
  const greeting = useMemo(() => greetingForNow(), []);

  // The hero sentence is assembled from whichever counts are actually non-zero, so a brand-new
  // account gets a true sentence rather than "0 jobs match your profile".
  const heroFacts = [];
  if (jobs.length) heroFacts.push(`${jobs.length} open role${jobs.length === 1 ? "" : "s"} match your profile`);
  if (inProgress.length) heroFacts.push(`${inProgress.length} application${inProgress.length === 1 ? "" : "s"} in progress`);
  if (pendingConnectionsCount) {
    heroFacts.push(`${pendingConnectionsCount} connection request${pendingConnectionsCount === 1 ? "" : "s"} waiting`);
  }
  const heroLine = heroFacts.length
    ? `${heroFacts.join(" · ")}.`
    : "Complete your profile to start seeing roles matched to your skills.";

  const anyRailLoading = applicationsQuery.isLoading || jobsQuery.isLoading;

  // Tiles are figures, not headings — they carry no heading level, and each label is bound to its
  // value through the tile's own text rather than by position.
  const metricTiles = [
    { key: "apps", icon: ICONS.briefcase, label: "Applications", value: applications.length, hint: "submitted", loading: applicationsQuery.isLoading, error: applicationsQuery.isError },
    { key: "progress", icon: ICONS.clock, label: "In progress", value: inProgress.length, hint: "awaiting a decision", loading: applicationsQuery.isLoading, error: applicationsQuery.isError },
    { key: "requests", icon: ICONS.users, label: "Requests", value: pendingConnectionsCount, hint: "to review", loading: pendingConnectionsQuery.isLoading, error: pendingConnectionsQuery.isError },
    // Total conversations, NOT unread: no unread counter exists on a chat session, so labelling
    // these "new" would be inventing a figure.
    { key: "chats", icon: ICONS.chat, label: "Conversations", value: chatSessionsCount, hint: "open", loading: chatSessionsQuery.isLoading, error: chatSessionsQuery.isError }
  ];

  return (
    <div className="free-home">
      <section className="nh-hero" aria-labelledby="nh-hero-title">
        <div className="nh-hero__body">
          <p className="nh-eyebrow nh-hero__eyebrow">{greeting}</p>
          <h1 className="nh-hero__title" id="nh-hero-title">
            Welcome back, {firstName}
          </h1>
          <p className="nh-hero__sub">{heroLine}</p>
        </div>
        <Link className="nh-btn nh-btn--upgrade" to="/upgrade">
          <Icon path={ICONS.sparkle} />
          Upgrade to Pro
        </Link>
      </section>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* DOM order is centre -> right rail -> left rail, which IS the stacked reading order the
          brief calls for (feed, then matches and applications, then profile). The wide layout puts
          the profile rail back in column 1 by explicit grid placement, so no `order` property is
          needed and assistive technology never reads a different sequence from the visual one. */}
      <div className="nh-split">
        <section className="nh-centre" aria-label="Community feed">
          <div className="nh-card nh-composer">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                createPostMutation.mutate();
              }}
            >
              <div className="nh-composer__top">
                <span className="nh-avatar nh-avatar--sm" aria-hidden="true">{initials}</span>
                {isComposerOpen ? (
                  <textarea
                    autoFocus
                    rows={3}
                    className="nh-composer__input"
                    value={postContent}
                    onChange={(event) => setPostContent(event.target.value)}
                    placeholder="Share an update, a job opening, or a win…"
                    aria-label="Write a post"
                    required
                  />
                ) : (
                  <button
                    type="button"
                    style={pillTriggerStyle}
                    className="nh-composer__trigger"
                    onClick={() => setIsComposerOpen(true)}
                  >
                    Share an update, a job opening, or a win…
                  </button>
                )}
              </div>

              {postFiles.length ? (
                <p className="nh-composer__files">{postFiles.map((file) => file.name).join(", ")}</p>
              ) : null}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />

              {/* The reference's composer row is Photo | Video | Event | Post job. "Post job" is an
                  ORGANIZATION action and is gone — a seeker cannot post a job. "Event" is gone too:
                  Post.postType has no event member, so the button would do nothing. Photo and Video
                  are wired to the real multipart upload the /posts endpoint already accepts. */}
              <div className="nh-composer__actions">
                <button
                  type="button"
                  style={actionButtonStyle}
                  className="nh-composer__action"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Icon path={ICONS.photo} />
                  Photo
                </button>
                <button
                  type="button"
                  style={actionButtonStyle}
                  className="nh-composer__action"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Icon path={ICONS.video} />
                  Video
                </button>
                {isComposerOpen ? (
                  <button
                    type="submit"
                    className="nh-btn nh-btn--primary nh-composer__submit"
                    disabled={createPostMutation.isPending || !postContent.trim()}
                  >
                    {createPostMutation.isPending ? "Posting…" : "Post"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          {feedQuery.isLoading ? (
            <div className="nh-card"><p className="nh-empty">Loading the feed…</p></div>
          ) : feedQuery.isError ? (
            <div className="nh-card">
              <p className="nh-empty">
                We couldn’t load posts right now.{" "}
                <button type="button" className="nh-linkbtn" onClick={() => feedQuery.refetch()}>Try again</button>
              </p>
            </div>
          ) : posts.length ? (
            posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                session={session}
                commentValue={commentDrafts[post._id]}
                onCommentChange={(postId, value) => setCommentDrafts((current) => ({ ...current, [postId]: value }))}
                isMutating={likePostMutation.isPending || commentPostMutation.isPending}
                onLike={(postId) => likePostMutation.mutate(postId)}
                onComment={handleCommentPost}
                onDelete={handleDeletePost}
                isDeleting={deletePostMutation.isPending}
              />
            ))
          ) : (
            <div className="nh-card nh-blank">
              <span className="nh-blank__mark" aria-hidden="true"><Icon path={ICONS.chat} className="nh-icon nh-icon--lg" /></span>
              <p className="nh-blank__title">No posts yet</p>
              <p className="nh-blank__sub">Share an update and it will show up here for your network.</p>
            </div>
          )}
        </section>

        <aside className="nh-rail nh-rail--activity" aria-label="Your activity and recommendations">
          <section className="nh-card" aria-labelledby="nh-activity-title">
            <div className="nh-card__head">
              <div>
                <p className="nh-eyebrow">Activity</p>
                {/* Not "This week": none of these figures are windowed to a week, and there is no
                    historical series to window them against. */}
                <h2 className="nh-card__title" id="nh-activity-title">At a glance</h2>
              </div>
            </div>
            <div className="nh-metrics">
              {metricTiles.map((tile) => (
                <div className="nh-metric" key={tile.key}>
                  <p className="nh-metric__label">
                    <Icon path={tile.icon} />
                    {tile.label}
                  </p>
                  <p className="nh-metric__value">
                    {tile.loading ? <span className="nh-metric__pending">—</span>
                      : tile.error ? <span className="nh-metric__pending">n/a</span>
                        : tile.value}
                  </p>
                  <p className="nh-metric__hint">
                    {tile.loading ? "Loading" : tile.error ? "Could not load" : tile.hint}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="nh-card" aria-labelledby="nh-matches-title">
            <div className="nh-card__head">
              <div>
                <p className="nh-eyebrow">For you</p>
                <h2 className="nh-card__title" id="nh-matches-title">Top matches</h2>
              </div>
              <Link className="nh-seeall" to="/jobs">See all</Link>
            </div>
            {jobsQuery.isLoading ? (
              <p className="nh-empty">Finding roles that fit…</p>
            ) : jobsQuery.isError ? (
              <p className="nh-empty">
                We couldn’t load matches.{" "}
                <button type="button" className="nh-linkbtn" onClick={() => jobsQuery.refetch()}>Try again</button>
              </p>
            ) : jobs.length ? (
              <ul className="nh-list">
                {jobs.slice(0, 3).map((job) => {
                  // matchScore is always present from recommendationController; the guard is for a
                  // cached response from before it was added. A missing score renders no badge
                  // rather than a fabricated percentage.
                  const score = Number.isFinite(Number(job.matchScore)) ? Math.round(Number(job.matchScore)) : null;
                  return (
                    <li key={job._id}>
                      <Link className="nh-row" to={`/jobs/${job._id}`}>
                        <CompanyLogo organization={job.organizationId} size="sm" />
                        <span className="nh-row__body">
                          <span className="nh-row__title">{job.title}</span>
                          <span className="nh-row__meta">
                            {[job.organizationId?.companyName, job.location].filter(Boolean).join(" · ") || "Company"}
                          </span>
                        </span>
                        {score === null ? null : (
                          <span className="nh-score">
                            {score}<span className="nh-score__unit">%</span>
                            <span className="nh-sr-only"> match with your profile</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="nh-empty">
                No matches yet. <Link className="nh-linkbtn" to="/profile">Add your skills</Link> and we’ll match you to open roles.
              </p>
            )}
          </section>

          <section className="nh-card" aria-labelledby="nh-apps-title">
            <div className="nh-card__head">
              <div>
                <p className="nh-eyebrow">Applications</p>
                <h2 className="nh-card__title" id="nh-apps-title">In progress</h2>
              </div>
              {applications.length ? <Link className="nh-seeall" to="/applied">See all</Link> : null}
            </div>
            {applicationsQuery.isLoading ? (
              <p className="nh-empty">Loading your applications…</p>
            ) : applicationsQuery.isError ? (
              <p className="nh-empty">
                We couldn’t load your applications.{" "}
                <button type="button" className="nh-linkbtn" onClick={() => applicationsQuery.refetch()}>Try again</button>
              </p>
            ) : inProgress.length ? (
              <ul className="nh-list">
                {inProgress.slice(0, 4).map((application) => (
                  <li key={application._id}>
                    <div className="nh-row nh-row--static">
                      <CompanyLogo organization={application.organizationId} size="sm" />
                      <span className="nh-row__body">
                        {/* The title lives at jobId.title — Application has no `jobTitle` field, so
                            reading one produced a page of rows all labelled "Job Application". */}
                        <span className="nh-row__title">{application.jobId?.title || "Role no longer listed"}</span>
                        <span className="nh-row__meta">{application.organizationId?.companyName || "Company"}</span>
                      </span>
                      <span className={["nh-pill", STATUS_TONE[application.status] || ""].filter(Boolean).join(" ")}>
                        {APPLICATION_STATUS_LABELS[application.status] || application.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : applications.length ? (
              <p className="nh-empty">No applications are open right now — every one has been decided.</p>
            ) : (
              <p className="nh-empty">
                You haven’t applied to anything yet. <Link className="nh-linkbtn" to="/jobs">Browse jobs</Link>.
              </p>
            )}
          </section>
        </aside>

        <aside className="nh-rail nh-rail--profile" aria-label="Your profile">
          <section className="nh-card nh-profile" aria-labelledby="nh-profile-name">
            <div className="nh-profile__banner" aria-hidden="true" />
            <span className="nh-avatar nh-avatar--lg" aria-hidden="true">{initials}</span>
            <h2 className="nh-profile__name" id="nh-profile-name">
              {firstName} {lastName}
            </h2>
            <p className="nh-profile__headline">{headline}</p>
            <Link className="nh-btn nh-btn--ghost nh-profile__cta" to="/profile">View profile</Link>
          </section>

          <section className="nh-card" aria-labelledby="nh-strength-title">
            <div className="nh-card__head">
              <div>
                <p className="nh-eyebrow">{profileStrength.percent}% complete</p>
                <h2 className="nh-card__title" id="nh-strength-title">Profile strength</h2>
              </div>
            </div>

            <div
              className="nh-bar"
              role="progressbar"
              aria-valuenow={profileStrength.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-labelledby="nh-strength-title"
              aria-valuetext={`${profileStrength.percent} percent complete, ${profileStrength.completedCount} of ${profileStrength.totalCount} sections filled`}
            >
              <span className="nh-bar__fill" style={{ width: `${profileStrength.percent}%` }} />
            </div>
            {/* Text equivalent of the bar, for anyone who cannot see the fill at all. */}
            <p className="nh-bar__text">
              {profileStrength.completedCount} of {profileStrength.totalCount} profile sections filled
            </p>

            {profileStrength.missing.length ? (
              <ul className="nh-todo">
                {profileStrength.missing.map((section) => (
                  <li key={section.key}>
                    <Link className="nh-todo__link" to={section.to}>
                      <span className="nh-todo__dot" aria-hidden="true" />
                      <span className="nh-todo__label">{section.label}</span>
                      {section.required ? <span className="nh-pill nh-pill--req">Required</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nh-empty nh-empty--tight">Your profile is complete. Nice work.</p>
            )}
          </section>

          {anyRailLoading ? <p className="nh-sr-only" role="status">Loading your dashboard.</p> : null}
        </aside>
      </div>
    </div>
  );
}
