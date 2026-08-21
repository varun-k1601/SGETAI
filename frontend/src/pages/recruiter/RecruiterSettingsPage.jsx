import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Recruiter settings (/recruiter/settings) — organization accounts only.
   ===============================================================================================
   RESTYLE. Every endpoint this page already called is carried forward unchanged:
     GET    /organization/members                 listMembers
     POST   /organization/members/invite          inviteMember      (Owner/Admin)
     PUT    /organization/members/:id/role        updateMemberRole  (Owner only)
     DELETE /organization/members/:id             removeMember      (Owner/Admin)
     GET    /organization/members/me/settings     getMyMemberSettings
     PUT    /organization/members/me/settings     updateMyMemberSettings
   ...plus GET/PUT /profile/me for the organization profile card, which is the SAME endpoint
   ProfilePage's organization branch already uses — no new route was added. profileController
   merges via Object.assign over an allowlist, so submitting only these four keys leaves
   description / headquarters / linkedinPage / etc. untouched.

   ------------------------------------------------------------------------------------------------
   ROLES: the real enum is ["Owner", "Admin", "Recruiter"] (OrganizationMember.js). There is no
   "Hiring Manager" — the API would 400 it — so none is rendered or offered. Owner IS shown; it is
   the real top role and the only one permitted to change other members' roles.

   ------------------------------------------------------------------------------------------------
   NOTIFICATIONS — the three reference toggles are rendered DISABLED (option A). None of them has
   anywhere to write: there is no notificationPreferences field on Organization or on
   OrganizationMember, and services/notificationService.js createNotification() consults no
   preference at all before creating a notification. Each row states its own real reason, because
   the three differ:
     Daily pipeline digest      no digest job exists (workers/ has autoApply, midnightCron,
                                recruiterIntroduction and verificationCron — none produces a digest)
     High-match candidate ≥90%  nothing anywhere emits a notification on a high atsScore
     Background check complete  the notification DOES already fire (verificationController's
                                submitVerification calls createNotification) — what is missing is
                                any way to switch it OFF
   A toggle that silently discards the click is worse than a disabled one, so none of them has a
   handler.

   recruiterIntroOptOut is the ONE real member preference and it is KEPT — the reference has no
   slot for it, but it is shipped, wired, and gates recruiterIntroductionWorker. It sits at the top
   of the notifications card as the only working toggle.

   The root .recruiter-settings is a TRANSPARENT LAYOUT CONTAINER — no background, no padding of
   its own. .main-panel already pads and scrolls this region.
   =============================================================================================== */

// The real OrganizationMember.role enum, in authority order. Owner is not offered on INVITE (a new
// member is never created as Owner) but is offered when changing an existing member's role, and is
// always rendered as a pill.
const MEMBER_ROLE_OPTIONS = ["Owner", "Admin", "Recruiter"];
const INVITABLE_ROLES = ["Admin", "Recruiter"];

const ROLE_TONE = { Owner: "accent", Admin: "info", Recruiter: "muted" };
const STATUS_TONE = { Active: "ok", Invited: "warn", Disabled: "muted" };

// The three unbacked toggles, each with the specific reason it cannot be switched.
const UNAVAILABLE_NOTIFICATIONS = [
  {
    key: "dailyDigest",
    icon: "bell",
    title: "Daily pipeline digest",
    description: "Morning summary of new applicants.",
    reason: "No digest job exists yet, so there is nothing to switch on or off.",
  },
  {
    key: "highMatch",
    icon: "users",
    title: "New high-match candidate",
    description: "Alert when a candidate matches at 90% or above.",
    reason: "No notification is sent for high match scores yet.",
  },
  {
    key: "backgroundCheck",
    icon: "shield",
    title: "Background check complete",
    description: "Notify the moment a manager returns a verification.",
    reason: "This notification already sends and cannot be turned off yet.",
  },
];

function getInitials(firstName, lastName, email) {
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.trim();
  if (initials) return initials.toUpperCase();
  return (email?.[0] || "?").toUpperCase();
}

function memberDisplayName(member) {
  return `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.email;
}

function Icon({ name, className = "rs-icon" }) {
  const paths = {
    bell: (
      <>
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <path d="M16 3.128a4 4 0 0 1 0 7.744" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
    shield: (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      </>
    ),
    plus: (
      <>
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </>
    ),
    more: (
      <>
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
      </>
    ),
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </>
    ),
  };

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
    >
      {paths[name]}
    </svg>
  );
}

/* A real checkbox with role="switch": `checked` maps to aria-checked natively, so the state is
   exposed correctly without hand-writing an aria-checked that could drift from the DOM. */
function Toggle({ id, checked, onChange, disabled, describedBy, label }) {
  return (
    <span className="rs-toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="rs-toggle__input"
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-describedby={describedBy}
        aria-label={label}
        onChange={onChange}
      />
      <span className="rs-toggle__track" aria-hidden="true">
        <span className="rs-toggle__thumb" />
      </span>
    </span>
  );
}

export function RecruiterSettingsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const uid = useId();

  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Recruiter");
  const [openMenuId, setOpenMenuId] = useState("");

  const actingRole = session?.memberRole || null;
  const isOwner = actingRole === "Owner";
  // MANAGER_ROLES server-side. Real enforcement is requireOrgMemberRole; this only decides what
  // renders, so a control that would 403 is never offered in the first place.
  const canManageTeam = isOwner || actingRole === "Admin";

  /* ---- Organization profile ------------------------------------------------------------------ */

  const profileQuery = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => apiRequest("/profile/me", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const profile = profileQuery.data?.profile;

  const [orgForm, setOrgForm] = useState({
    companyName: "",
    industry: "",
    companySize: "",
    websiteUrl: "",
  });
  const [orgBaseline, setOrgBaseline] = useState(orgForm);

  useEffect(() => {
    if (!profile) return;
    const next = {
      companyName: profile.companyName || "",
      industry: profile.industry || "",
      companySize: profile.companySize || "",
      websiteUrl: profile.websiteUrl || "",
    };
    setOrgForm(next);
    setOrgBaseline(next);
  }, [profile]);

  const orgDirty = useMemo(
    () => JSON.stringify(orgForm) !== JSON.stringify(orgBaseline),
    [orgForm, orgBaseline]
  );

  const orgMutation = useMutation({
    // Only these four keys are sent. profileController allowlists and Object.assigns, so every
    // other organization field is left exactly as it was.
    mutationFn: () => apiRequest("/profile/me", { method: "PUT", token: session.accessToken, body: orgForm }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Organization profile updated." });
      setOrgBaseline(orgForm);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  /* ---- Team ----------------------------------------------------------------------------------- */

  const membersQuery = useQuery({
    queryKey: ["organization", "members"],
    queryFn: () => apiRequest("/organization/members", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const members = membersQuery.data?.members || [];

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiRequest("/organization/members/invite", {
        method: "POST",
        token: session.accessToken,
        body: { email: inviteEmail, role: inviteRole },
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Invite sent." });
      setInviteEmail("");
      setInviteRole("Recruiter");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["organization", "members"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }) =>
      apiRequest(`/organization/members/${memberId}/role`, {
        method: "PUT",
        token: session.accessToken,
        body: { role },
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Role updated." });
      setOpenMenuId("");
      queryClient.invalidateQueries({ queryKey: ["organization", "members"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId) =>
      apiRequest(`/organization/members/${memberId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Team member removed." });
      setOpenMenuId("");
      queryClient.invalidateQueries({ queryKey: ["organization", "members"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  /* ---- This member's own settings -------------------------------------------------------------
     Scoped server-side to req.user.memberId — no member id is sent, so this can only ever read or
     change the signed-in person's own opt-out. */

  const memberSettingsQuery = useQuery({
    queryKey: ["organization", "member", "settings"],
    queryFn: () => apiRequest("/organization/members/me/settings", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    retry: false,
  });

  const memberSettingsMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest("/organization/members/me/settings", {
        method: "PUT",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "member", "settings"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  // Rendered as "receiving introductions is ON", the inverse of the stored opt-OUT flag — the
  // toggle reads as a capability the member has, not as a negation they have to parse.
  const introductionsEnabled = !memberSettingsQuery.data?.member?.recruiterIntroOptOut;

  // Prefer the id the server resolved for the acting member; fall back to the session claim.
  const actingMemberId = memberSettingsQuery.data?.member?._id || session?.memberId || null;
  const activeOwnerCount = members.filter(
    (member) => member.role === "Owner" && member.status === "Active"
  ).length;

  function handleInviteSubmit(event) {
    event.preventDefault();
    setFeedback({ type: "", message: "" });
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate();
  }

  function handleRemoveMember(member) {
    const isInvite = member.status === "Invited";
    const confirmed = window.confirm(
      isInvite
        ? `Revoke the invite for ${member.email}? They will no longer be able to join with it.`
        : `Remove ${memberDisplayName(member)} from the team? They will lose access immediately.`
    );
    if (confirmed) {
      removeMutation.mutate(member._id);
    }
  }

  // Mirrors the controller's real guards, plus one it does NOT have (see the self-action note in
  // the deliverable): the last remaining Active Owner cannot be demoted or removed, and nobody is
  // offered a control that would lock them out of their own account.
  function permissionsFor(member) {
    const isSelf = actingMemberId && String(member._id) === String(actingMemberId);
    const isLastActiveOwner =
      member.role === "Owner" && member.status === "Active" && activeOwnerCount <= 1;

    let roleReason = "";
    if (!isOwner) roleReason = "Only an Owner can change team roles.";
    else if (isSelf) roleReason = "You cannot change your own role.";
    else if (isLastActiveOwner) roleReason = "This is the last remaining Owner.";

    let removeReason = "";
    if (!canManageTeam) removeReason = "Only an Owner or Admin can remove teammates.";
    else if (isSelf) removeReason = "You cannot remove yourself.";
    else if (isLastActiveOwner) removeReason = "This is the last remaining Owner.";
    else if (member.status === "Disabled") removeReason = "This member has already been removed.";

    return {
      isSelf,
      canChangeRole: !roleReason,
      canRemove: !removeReason,
      roleReason,
      removeReason,
      hasAnyAction: !roleReason || !removeReason,
    };
  }

  return (
    <section className="recruiter-settings">
      {/* ---- 1. Hero ---------------------------------------------------------------------- */}
      <header className="rs-hero">
        <p className="rs-eyebrow rs-eyebrow--onHero">Settings</p>
        <h1 className="rs-hero__title">Team &amp; workspace</h1>
      </header>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* ---- 2. Organization profile ------------------------------------------------------- */}
      <form
        className="rs-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!orgDirty || orgMutation.isPending) return;
          setFeedback({ type: "", message: "" });
          orgMutation.mutate();
        }}
      >
        <div className="rs-card__head">
          <div>
            <p className="rs-eyebrow">Company</p>
            <h2 className="rs-card__title">Organization profile</h2>
          </div>
        </div>

        {profileQuery.isLoading ? (
          <p className="rs-state">Loading organization profile…</p>
        ) : profileQuery.isError ? (
          <p className="rs-state rs-state--error">
            <Icon name="alert" className="rs-icon rs-icon--sm" />
            {profileQuery.error?.message || "Could not load your organization profile."}
          </p>
        ) : (
          <>
            <div className="rs-grid">
              <div className="rs-field">
                <label className="rs-label" htmlFor={`${uid}-companyName`}>
                  Company name
                </label>
                <input
                  id={`${uid}-companyName`}
                  className="rs-input"
                  value={orgForm.companyName}
                  onChange={(event) => setOrgForm((f) => ({ ...f, companyName: event.target.value }))}
                />
              </div>
              <div className="rs-field">
                <label className="rs-label" htmlFor={`${uid}-industry`}>
                  Industry
                </label>
                <input
                  id={`${uid}-industry`}
                  className="rs-input"
                  value={orgForm.industry}
                  onChange={(event) => setOrgForm((f) => ({ ...f, industry: event.target.value }))}
                />
              </div>
              <div className="rs-field">
                <label className="rs-label" htmlFor={`${uid}-companySize`}>
                  Size
                </label>
                <input
                  id={`${uid}-companySize`}
                  className="rs-input"
                  value={orgForm.companySize}
                  onChange={(event) => setOrgForm((f) => ({ ...f, companySize: event.target.value }))}
                  placeholder="e.g. 201–500"
                />
              </div>
              <div className="rs-field">
                <label className="rs-label" htmlFor={`${uid}-websiteUrl`}>
                  Website
                </label>
                <input
                  id={`${uid}-websiteUrl`}
                  className="rs-input"
                  type="url"
                  value={orgForm.websiteUrl}
                  onChange={(event) => setOrgForm((f) => ({ ...f, websiteUrl: event.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="rs-card__foot">
              <p className="rs-hint" aria-live="polite">
                {orgDirty ? "You have unsaved changes." : "Everything here is saved."}
              </p>
              <button
                type="submit"
                className="rs-btn rs-btn--primary"
                disabled={!orgDirty || orgMutation.isPending}
                aria-disabled={!orgDirty || orgMutation.isPending}
              >
                {orgMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </form>

      {/* ---- 3. Recruiters ------------------------------------------------------------------ */}
      <section className="rs-card">
        <div className="rs-card__head">
          <div>
            <p className="rs-eyebrow">Team</p>
            <h2 className="rs-card__title">Recruiters</h2>
          </div>
          {canManageTeam ? (
            <button
              type="button"
              className="rs-btn rs-btn--primary"
              onClick={() => setInviteOpen((open) => !open)}
              aria-expanded={inviteOpen}
            >
              <Icon name="plus" className="rs-icon rs-icon--sm" />
              Invite
            </button>
          ) : (
            // Not silently absent: the control is shown, visibly unavailable, with the reason.
            <span className="rs-locked">
              <Icon name="lock" className="rs-icon rs-icon--sm" />
              Only an Owner or Admin can invite teammates
            </span>
          )}
        </div>

        {canManageTeam && inviteOpen ? (
          <form className="rs-invite" onSubmit={handleInviteSubmit}>
            <div className="rs-field rs-invite__email">
              <label className="rs-label" htmlFor={`${uid}-inviteEmail`}>
                Teammate email
              </label>
              <input
                id={`${uid}-inviteEmail`}
                className="rs-input"
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@company.com"
              />
            </div>
            <div className="rs-field">
              <label className="rs-label" htmlFor={`${uid}-inviteRole`}>
                Role
              </label>
              {/* Owner is intentionally absent: a new member is never created as Owner. */}
              <select
                id={`${uid}-inviteRole`}
                className="rs-input"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                {INVITABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rs-btn rs-btn--primary"
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
            >
              {inviteMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </form>
        ) : null}

        {membersQuery.isLoading ? (
          <p className="rs-state">Loading team…</p>
        ) : membersQuery.isError ? (
          <p className="rs-state rs-state--error">
            <Icon name="alert" className="rs-icon rs-icon--sm" />
            {membersQuery.error?.message || "Could not load your team."}
          </p>
        ) : members.length ? (
          <ul className="rs-members">
            {members.map((member) => {
              const permissions = permissionsFor(member);
              const name = memberDisplayName(member);
              const menuOpen = openMenuId === member._id;

              return (
                <li
                  key={member._id}
                  className={`rs-member${member.status === "Disabled" ? " rs-member--disabled" : ""}`}
                >
                  <span className="rs-avatar" aria-hidden="true">
                    {getInitials(member.firstName, member.lastName, member.email)}
                  </span>

                  <div className="rs-member__body">
                    <p className="rs-member__name">
                      {name}
                      {permissions.isSelf ? <span className="rs-member__you"> (you)</span> : null}
                    </p>
                    <p className="rs-member__email">{member.email}</p>
                  </div>

                  <div className="rs-member__side">
                    {/* Status is only rendered when it carries information — an Invited member who
                        has not finished signup, or one who has been removed. */}
                    {member.status !== "Active" ? (
                      <span className={`rs-pill rs-pill--${STATUS_TONE[member.status] || "muted"}`}>
                        {member.status === "Invited" ? "Invite pending" : member.status}
                      </span>
                    ) : null}
                    <span className={`rs-pill rs-pill--${ROLE_TONE[member.role] || "muted"}`}>
                      {member.role}
                    </span>

                    {permissions.hasAnyAction ? (
                      <div className="rs-menu-wrap">
                        <button
                          type="button"
                          className="rs-icon-btn"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label={`Actions for ${name}`}
                          onClick={() => setOpenMenuId(menuOpen ? "" : member._id)}
                        >
                          <Icon name="more" className="rs-icon rs-icon--sm" />
                        </button>

                        {menuOpen ? (
                          <>
                            <button
                              type="button"
                              className="rs-menu-backdrop"
                              aria-label="Close menu"
                              onClick={() => setOpenMenuId("")}
                            />
                            <div className="rs-menu" role="menu">
                              {permissions.canChangeRole ? (
                                <div className="rs-menu__group">
                                  <label className="rs-label" htmlFor={`${uid}-role-${member._id}`}>
                                    Change role
                                  </label>
                                  <select
                                    id={`${uid}-role-${member._id}`}
                                    className="rs-input rs-input--sm"
                                    value={member.role}
                                    disabled={roleMutation.isPending}
                                    onChange={(event) => {
                                      setFeedback({ type: "", message: "" });
                                      roleMutation.mutate({
                                        memberId: member._id,
                                        role: event.target.value,
                                      });
                                    }}
                                  >
                                    {MEMBER_ROLE_OPTIONS.map((role) => (
                                      <option key={role} value={role}>
                                        {role}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <p className="rs-menu__note">{permissions.roleReason}</p>
                              )}

                              {permissions.canRemove ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="rs-menu__item rs-menu__item--danger"
                                  disabled={removeMutation.isPending}
                                  onClick={() => handleRemoveMember(member)}
                                >
                                  {member.status === "Invited" ? "Revoke invite" : "Remove from team"}
                                </button>
                              ) : (
                                <p className="rs-menu__note">{permissions.removeReason}</p>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <span
                        className="rs-icon-btn rs-icon-btn--locked"
                        aria-disabled="true"
                        title={permissions.roleReason || permissions.removeReason}
                      >
                        <Icon name="lock" className="rs-icon rs-icon--sm" />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rs-state">No team members yet.</p>
        )}
      </section>

      {/* ---- 4. Notifications ---------------------------------------------------------------- */}
      <section className="rs-card">
        <div className="rs-card__head">
          <div>
            <p className="rs-eyebrow">Notifications</p>
            <h2 className="rs-card__title">When to ping us</h2>
          </div>
        </div>

        <ul className="rs-notifs">
          {/* The one genuinely working toggle. Kept even though the reference has no slot for it —
              it is shipped behaviour that gates recruiterIntroductionWorker. */}
          <li className="rs-notif">
            <Icon name="sparkles" className="rs-icon rs-notif__icon" />
            <div className="rs-notif__body">
              <label className="rs-notif__title" htmlFor={`${uid}-intros`}>
                Receive candidate introductions
              </label>
              <p className="rs-notif__desc" id={`${uid}-intros-desc`}>
                When you publish a job, strongly-matched Pro candidates who opted in can be
                introduced to you with an AI-drafted first message. Turn this off to stop receiving
                them on jobs you post.
              </p>
            </div>
            <Toggle
              id={`${uid}-intros`}
              checked={introductionsEnabled}
              disabled={memberSettingsMutation.isPending || memberSettingsQuery.isLoading}
              describedBy={`${uid}-intros-desc`}
              onChange={() =>
                memberSettingsMutation.mutate({ recruiterIntroOptOut: introductionsEnabled })
              }
            />
          </li>

          {UNAVAILABLE_NOTIFICATIONS.map((item) => (
            <li className="rs-notif rs-notif--off" key={item.key}>
              <Icon name={item.icon} className="rs-icon rs-notif__icon" />
              <div className="rs-notif__body">
                <label className="rs-notif__title" htmlFor={`${uid}-${item.key}`}>
                  {item.title}
                </label>
                <p className="rs-notif__desc">{item.description}</p>
                {/* The reason is visible text, not just a title attribute or a dimmed control. */}
                <p className="rs-notif__reason" id={`${uid}-${item.key}-reason`}>
                  <Icon name="lock" className="rs-icon rs-icon--xs" />
                  {item.reason}
                </p>
              </div>
              {/* No handler at all. A toggle that accepts a click and discards it is worse than one
                  that plainly cannot be moved. */}
              <Toggle
                id={`${uid}-${item.key}`}
                checked={false}
                disabled
                describedBy={`${uid}-${item.key}-reason`}
                onChange={() => {}}
              />
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
