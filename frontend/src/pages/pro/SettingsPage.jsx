import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Settings (/pro/settings) — seeker-only. The recruiter equivalent is /recruiter/settings and is
   a separate page; nothing here touches it.
   ===============================================================================================
   WHAT THE PREVIOUS VERSION OF THIS FILE DID, AND WHY ALMOST NONE OF IT SURVIVED VERBATIM.

   Every control on the old page wrote to a local useState and nothing else. The profile inputs,
   all three notification toggles, "Stealth mode" and both integration rows were lost the moment
   the user navigated away, and the form was seeded with hardcoded stand-ins ("Alex Rivera",
   "alex@example.com", "San Francisco, CA", "Senior Frontend Engineer") that rendered as if they
   were the signed-in seeker's own data. So "carry every working control forward" had almost
   nothing to carry: each section here is either wired to a real endpoint or visibly inert.

   WIRED TO REAL ENDPOINTS
     Account       PUT /profile/me  — firstName, lastName, tagline, linkedinUrl, githubUrl,
                   portfolioUrl are all in profileController's seekerEditableFields allow-list.
     Privacy       PUT /seekers/visibility — jobSeekerController.updateVisibility already exists.
     Billing       GET /subscriptions/me + GET /subscriptions/plans (both shared with UpgradePage).
     Integrations  GET /pro/linkedin/status, /pro/linkedin/connect, POST /pro/linkedin/disconnect.
     Sign out      AuthContext logout.

   DELIBERATELY NOT BUILT — each would have had to invent something
     Location      JobSeeker has no location field. locationPreferences is an auto-apply filter
                   list, not a home city. Omitted rather than bound to the wrong column.
     Price         Never a literal. The amount AND the currency come from /subscriptions/plans
                   (₹499 monthly / ₹4999 yearly today) joined to the seeker's own plan id.
     Card on file  No model stores one. SubscriptionPayment has no last4, brand or method field,
                   and neither the mock nor the Razorpay path saves an instrument. Omitted.
     Notifications No user-level preference model exists anywhere (Follow.notificationPreferences
                   is per-followed-organization). The switches render disabled and say so.
     GitHub /      These are githubUrl and portfolioUrl — plain strings on the profile. Shown as
     Portfolio     the text fields they are, not as authorized connections. LinkedIn is the only
                   row in Integrations because it is the only one with an OAuth token.
     Delete acct   No endpoint. Deleting a JobSeeker would orphan Applications, introductions,
                   chat sessions, posts, connections, resumes and tickets, so a button wired to
                   nothing — or to a partial delete — is worse than its absence.
     Auto-renewal  Checkout is a one-off payment that pushes proExpiresAt out by durationDays
                   (subscriptionService.calculateExpiry). Nothing re-bills, so this page says
                   "access runs until", never "next billing on".
   =============================================================================================== */

// In-page anchors, not routes. Ids are prefixed so they cannot collide with anything else the
// shell renders.
const SECTIONS = [
  { id: "st-account", label: "Account" },
  { id: "st-notifications", label: "Notifications" },
  { id: "st-privacy", label: "Privacy & security" },
  { id: "st-billing", label: "Billing" },
  { id: "st-integrations", label: "Integrations" }
];

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "tagline",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl"
];

// Descriptions are written from what the code actually does, not from what the labels suggest:
// searchSeekers filters on { profileVisibility: { $ne: "Private" } }, so NetworkOnly profiles are
// still *listed* in search — it is getSeekerProfile that closes the profile page to non-connections.
const VISIBILITY_OPTIONS = [
  {
    value: "Public",
    label: "Public",
    description:
      "You appear in candidate search, and anyone signed in can open your full profile."
  },
  {
    value: "NetworkOnly",
    label: "Connections only",
    description:
      "You still appear in candidate search, but your full profile opens only for seekers you have an accepted connection with.",
    proOnly: true
  },
  {
    value: "Private",
    label: "Private",
    description:
      "You are excluded from candidate search entirely, and nobody else can open your profile."
  }
];

// Rendered disabled. Kept visible rather than deleted because the absence of these controls is
// itself worth stating — see the banner above them.
const NOTIFICATION_PREFERENCES = [
  {
    id: "email-digest",
    label: "Email digest",
    description: "A daily roll-up of application movement and recruiter replies."
  },
  {
    id: "push-messages",
    label: "Push recruiter messages",
    description: "Browser alerts the moment a recruiter opens a chat with you."
  },
  {
    id: "weekly-summary",
    label: "Weekly summary",
    description: "A Sunday recap of matches, applications and profile views."
  },
  {
    id: "ai-activity",
    label: "AI activity",
    description: "Alerts when auto-apply submits an application or an intro is sent for you."
  }
];

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// plan.amount is in major units — subscriptionService multiplies by 100 only when handing the
// figure to Razorpay — so no division here. Currency is whatever the API says it is.
function formatMoney(amount, currency) {
  if (!Number.isFinite(amount) || !currency) {
    return null;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatPeriod(durationDays) {
  if (durationDays === 30) {
    return "month";
  }

  if (durationDays === 365) {
    return "year";
  }

  return Number.isFinite(durationDays) ? `${durationDays} days` : null;
}

// The rail's active state has to follow whatever box is actually scrolling. .main-panel owns the
// scroll on this route, but walking up for it beats hardcoding a shell class that could be
// renamed out from under this page.
function findScrollParent(node) {
  let current = node?.parentElement;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);

    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function Icon({ path, className = "st-icon" }) {
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
      {path}
    </svg>
  );
}

const ICONS = {
  account: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  bell: <><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></>,
  card: <><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></>,
  plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></>,
  linkedin: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></>,
  logout: <><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>
};

const SECTION_ICONS = {
  "st-account": ICONS.account,
  "st-notifications": ICONS.bell,
  "st-privacy": ICONS.shield,
  "st-billing": ICONS.card,
  "st-integrations": ICONS.plug
};

export function SettingsPage() {
  const { session, replaceProfile, logout } = useAuth();
  const queryClient = useQueryClient();
  const token = session?.accessToken;
  const profile = session?.profile;
  const isPro = Boolean(session?.isPro || profile?.isPro);

  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const clearFeedback = useCallback(() => setFeedback({ type: "", message: "" }), []);

  /* --- Section nav ------------------------------------------------------------------------- */

  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const sectionRefs = useRef({});

  useEffect(() => {
    const nodes = SECTIONS.map((section) => sectionRefs.current[section.id]).filter(Boolean);

    if (!nodes.length || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    // The bottom inset means a section only counts as "current" once it reaches the upper part of
    // the viewport, so the rail highlights what you are reading rather than what is barely peeking
    // in from below.
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        });

        const current = SECTIONS.find((section) => visible.has(section.id));

        if (current) {
          setActiveSection(current.id);
        }
      },
      { root: findScrollParent(nodes[0]), rootMargin: "-8px 0px -55% 0px", threshold: 0 }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  function handleNavClick(event, id) {
    const node = sectionRefs.current[id];

    // No node means something went wrong mounting the section — let the plain #hash href do its
    // job rather than swallowing the click.
    if (!node) {
      return;
    }

    event.preventDefault();
    node.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    setActiveSection(id);
    // Without this the next Tab press would resume from the rail, not from the section the user
    // just jumped to.
    node.focus({ preventScroll: true });
  }

  /* --- Account ----------------------------------------------------------------------------- */

  // Baseline is memoised on the six primitive values, so it only takes a new identity when the
  // stored profile genuinely changes — i.e. after a save lands. That is exactly when the form
  // should be re-seeded, and never while the user is mid-edit.
  const baseline = useMemo(
    () => ({
      firstName: profile?.firstName || "",
      lastName: profile?.lastName || "",
      tagline: profile?.tagline || "",
      linkedinUrl: profile?.linkedinUrl || "",
      githubUrl: profile?.githubUrl || "",
      portfolioUrl: profile?.portfolioUrl || ""
    }),
    [
      profile?.firstName,
      profile?.lastName,
      profile?.tagline,
      profile?.linkedinUrl,
      profile?.githubUrl,
      profile?.portfolioUrl
    ]
  );

  const [form, setForm] = useState(baseline);

  useEffect(() => {
    setForm(baseline);
  }, [baseline]);

  const isDirty = PROFILE_FIELDS.some((field) => form[field].trim() !== baseline[field]);
  // firstName and lastName are `required: true` on the schema, so an empty save would come back a
  // validation error. Cheaper and clearer to block it here.
  const hasRequiredNames = Boolean(form.firstName.trim() && form.lastName.trim());

  const saveProfileMutation = useMutation({
    mutationFn: (updates) =>
      apiRequest("/profile/me", { method: "PUT", token, body: updates }),
    onSuccess: (response) => {
      if (response?.profile) {
        replaceProfile(response.profile);
      }
      setFeedback({ type: "", message: "Profile updated." });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Could not save your profile." });
    }
  });

  function handleFieldChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleProfileSubmit(event) {
    event.preventDefault();

    if (!isDirty || !hasRequiredNames || saveProfileMutation.isPending) {
      return;
    }

    // Only the fields that actually moved. Sending the untouched ones back would rewrite columns
    // this form does not own the full truth about.
    const updates = {};

    PROFILE_FIELDS.forEach((field) => {
      const next = form[field].trim();

      if (next !== baseline[field]) {
        updates[field] = next;
      }
    });

    saveProfileMutation.mutate(updates);
  }

  function handleProfileReset() {
    setForm(baseline);
    clearFeedback();
  }

  /* --- Privacy ----------------------------------------------------------------------------- */

  const currentVisibility = profile?.profileVisibility || "Public";

  const visibilityMutation = useMutation({
    mutationFn: (value) =>
      apiRequest("/seekers/visibility", {
        method: "PUT",
        token,
        body: { profileVisibility: value }
      }),
    onSuccess: (response, value) => {
      if (profile) {
        replaceProfile({
          ...profile,
          profileVisibility: response?.profileVisibility || value
        });
      }
      setFeedback({ type: "", message: "Profile visibility updated." });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error.message || "Could not update your profile visibility."
      });
    }
  });

  function handleVisibilityChange(value) {
    if (value === currentVisibility || visibilityMutation.isPending) {
      return;
    }

    visibilityMutation.mutate(value);
  }

  /* --- Billing ------------------------------------------------------------------------------ */

  // Same query keys UpgradePage uses, so the two pages share one cache entry instead of each
  // holding its own copy of the seeker's subscription.
  const subscriptionQuery = useQuery({
    queryKey: ["subscriptions", "me", session?.role],
    queryFn: () => apiRequest("/subscriptions/me", { token }),
    enabled: Boolean(token)
  });

  const plansQuery = useQuery({
    queryKey: ["subscriptions", "plans", session?.role],
    queryFn: () => apiRequest("/subscriptions/plans", { token }),
    enabled: Boolean(token)
  });

  const subscription = subscriptionQuery.data?.subscription || null;
  const plans = plansQuery.data?.plans || [];
  const activePlan = subscription?.plan
    ? plans.find((plan) => plan.id === subscription.plan) || null
    : null;

  const planPrice = activePlan ? formatMoney(activePlan.amount, activePlan.currency) : null;
  const planPeriod = activePlan ? formatPeriod(activePlan.durationDays) : null;
  const accessUntil = formatDate(subscription?.proExpiresAt || profile?.proExpiresAt);
  const latestPayment = subscription?.latestPayment || null;
  const latestPaymentAmount = latestPayment
    ? formatMoney(latestPayment.amount, latestPayment.currency)
    : null;
  const latestPaymentDate = formatDate(latestPayment?.paidAt || latestPayment?.createdAt);

  /* --- Integrations ------------------------------------------------------------------------- */

  const linkedinQuery = useQuery({
    queryKey: ["pro", "linkedin-status"],
    queryFn: () => apiRequest("/pro/linkedin/status", { token }),
    enabled: Boolean(token)
  });

  const linkedinStatus = linkedinQuery.data || null;
  const linkedinConnected = Boolean(linkedinStatus?.connected);

  const disconnectLinkedInMutation = useMutation({
    mutationFn: () => apiRequest("/pro/linkedin/disconnect", { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pro", "linkedin-status"] });
      setFeedback({ type: "", message: "LinkedIn account disconnected." });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Could not disconnect LinkedIn." });
    }
  });

  function handleConnectLinkedIn() {
    // A real top-level navigation, not an XHR — the connect handler authenticates from this query
    // param because LinkedIn's consent screen and its redirect back cannot carry our bearer header.
    window.location.href = `${API_BASE_URL}/pro/linkedin/connect?token=${encodeURIComponent(token)}`;
  }

  function handleDisconnectLinkedIn() {
    const confirmed = window.confirm(
      "Disconnect LinkedIn? Your access token is deleted, and publishing a drafted post to your feed will need you to connect again. Nothing already posted is affected."
    );

    if (confirmed) {
      disconnectLinkedInMutation.mutate();
    }
  }

  /* --- Session ------------------------------------------------------------------------------ */

  function handleSignOut() {
    if (window.confirm("Sign out of SGETAI on this device?")) {
      logout();
    }
  }

  const registerSection = (id) => (node) => {
    sectionRefs.current[id] = node;
  };

  return (
    <section className="settings-page" aria-labelledby="st-hero-title">
      <AutoDismissFeedback feedback={feedback} onClear={clearFeedback} />

      <header className="st-hero">
        <p className="st-eyebrow">Account</p>
        <h1 className="st-hero__title" id="st-hero-title">
          Settings
        </h1>
        <p className="st-hero__sub">
          Your details, who can see your profile, your Pro plan and the one account you have
          actually connected.
        </p>
      </header>

      <div className="st-layout">
        <nav className="st-rail" aria-label="Settings sections">
          <ul className="st-rail__list">
            {SECTIONS.map((section) => {
              const isActive = section.id === activeSection;

              return (
                <li key={section.id}>
                  <a
                    className={`st-rail__link${isActive ? " st-rail__link--active" : ""}`}
                    href={`#${section.id}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={(event) => handleNavClick(event, section.id)}
                  >
                    <Icon path={SECTION_ICONS[section.id]} className="st-icon st-icon--sm" />
                    <span>{section.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="st-stack">
          {/* ---- Account ---------------------------------------------------------------- */}
          <section
            className="st-card"
            id="st-account"
            ref={registerSection("st-account")}
            tabIndex={-1}
            aria-labelledby="st-account-title"
          >
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow">Account</p>
                <h2 className="st-card__title" id="st-account-title">
                  Profile information
                </h2>
                <p className="st-card__sub">
                  This is what recruiters see on your profile and on every application you send.
                </p>
              </div>
              <span className="st-tile">
                <Icon path={ICONS.account} />
              </span>
            </div>

            <form className="st-form" onSubmit={handleProfileSubmit} noValidate>
              <div className="st-grid">
                <div className="st-field">
                  <label className="st-label" htmlFor="st-first-name">
                    First name
                  </label>
                  <input
                    className="st-input"
                    id="st-first-name"
                    value={form.firstName}
                    onChange={(event) => handleFieldChange("firstName", event.target.value)}
                    autoComplete="given-name"
                    required
                  />
                </div>

                <div className="st-field">
                  <label className="st-label" htmlFor="st-last-name">
                    Last name
                  </label>
                  <input
                    className="st-input"
                    id="st-last-name"
                    value={form.lastName}
                    onChange={(event) => handleFieldChange("lastName", event.target.value)}
                    autoComplete="family-name"
                    required
                  />
                </div>

                <div className="st-field">
                  <label className="st-label" htmlFor="st-email">
                    Email
                  </label>
                  <input
                    className="st-input"
                    id="st-email"
                    type="email"
                    value={session?.email || ""}
                    readOnly
                    disabled
                    aria-describedby="st-email-note"
                  />
                  <p className="st-hint" id="st-email-note">
                    Your email is the identifier your account and sign-in are keyed on, so it
                    cannot be changed here.
                  </p>
                </div>

                <div className="st-field">
                  <label className="st-label" htmlFor="st-headline">
                    Headline
                  </label>
                  <input
                    className="st-input"
                    id="st-headline"
                    value={form.tagline}
                    onChange={(event) => handleFieldChange("tagline", event.target.value)}
                    placeholder="Senior Frontend Engineer"
                  />
                </div>
              </div>

              <div className="st-subhead">
                <h3 className="st-subhead__title">Profile links</h3>
                <p className="st-subhead__sub">
                  Links shown on your public profile. These are addresses you type, not accounts
                  you have authorised — connecting an account is under Integrations.
                </p>
              </div>

              <div className="st-grid">
                <div className="st-field">
                  <label className="st-label" htmlFor="st-linkedin-url">
                    LinkedIn URL
                  </label>
                  <input
                    className="st-input"
                    id="st-linkedin-url"
                    type="url"
                    inputMode="url"
                    value={form.linkedinUrl}
                    onChange={(event) => handleFieldChange("linkedinUrl", event.target.value)}
                    placeholder="https://www.linkedin.com/in/your-handle"
                  />
                </div>

                <div className="st-field">
                  <label className="st-label" htmlFor="st-github-url">
                    GitHub URL
                  </label>
                  <input
                    className="st-input"
                    id="st-github-url"
                    type="url"
                    inputMode="url"
                    value={form.githubUrl}
                    onChange={(event) => handleFieldChange("githubUrl", event.target.value)}
                    placeholder="https://github.com/your-handle"
                  />
                </div>

                <div className="st-field st-field--wide">
                  <label className="st-label" htmlFor="st-portfolio-url">
                    Portfolio site
                  </label>
                  <input
                    className="st-input"
                    id="st-portfolio-url"
                    type="url"
                    inputMode="url"
                    value={form.portfolioUrl}
                    onChange={(event) => handleFieldChange("portfolioUrl", event.target.value)}
                    placeholder="https://your-site.com"
                  />
                </div>
              </div>

              <div className="st-form__actions">
                <button
                  className="st-btn st-btn--primary"
                  type="submit"
                  disabled={!isDirty || !hasRequiredNames || saveProfileMutation.isPending}
                >
                  {saveProfileMutation.isPending ? "Saving…" : "Save changes"}
                </button>
                <button
                  className="st-btn"
                  type="button"
                  onClick={handleProfileReset}
                  disabled={!isDirty || saveProfileMutation.isPending}
                >
                  Discard
                </button>
                <p className="st-form__state" role="status">
                  {!hasRequiredNames
                    ? "First and last name are both required."
                    : isDirty
                      ? "You have unsaved changes."
                      : "Everything is saved."}
                </p>
              </div>
            </form>
          </section>

          {/* ---- Notifications ---------------------------------------------------------- */}
          <section
            className="st-card"
            id="st-notifications"
            ref={registerSection("st-notifications")}
            tabIndex={-1}
            aria-labelledby="st-notifications-title"
          >
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow">Notifications</p>
                <h2 className="st-card__title" id="st-notifications-title">
                  What you hear about
                </h2>
                <p className="st-card__sub">
                  Everything you are notified about today, in one place — even though none of it
                  is adjustable yet.
                </p>
              </div>
              <span className="st-tile st-tile--muted">
                <Icon path={ICONS.bell} />
              </span>
            </div>

            <p className="st-notice" id="st-notifications-note">
              <Icon path={ICONS.info} className="st-icon st-icon--sm" />
              <span>
                These switches are not connected to anything. There is no per-account notification
                preference stored on the server, so today every one of these is delivered in the
                bell menu regardless of what a switch here showed. They are left visible, and off,
                so it is clear the setting does not exist rather than looking as though it silently
                failed.
              </span>
            </p>

            <ul className="st-rows">
              {NOTIFICATION_PREFERENCES.map((preference) => (
                <li className="st-row st-row--inert" key={preference.id}>
                  <div className="st-row__text">
                    <p className="st-row__title">
                      {preference.label}
                      <span className="st-pill">Not built</span>
                    </p>
                    <p className="st-row__sub">{preference.description}</p>
                  </div>
                  <div className="st-row__control">
                    <label className="st-sr-only" htmlFor={`st-pref-${preference.id}`}>
                      {preference.label} (unavailable)
                    </label>
                    <input
                      className="st-switch"
                      id={`st-pref-${preference.id}`}
                      type="checkbox"
                      checked={false}
                      readOnly
                      disabled
                      aria-disabled="true"
                      aria-describedby="st-notifications-note"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- Privacy ----------------------------------------------------------------- */}
          <section
            className="st-card"
            id="st-privacy"
            ref={registerSection("st-privacy")}
            tabIndex={-1}
            aria-labelledby="st-privacy-title"
          >
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow">Privacy &amp; security</p>
                <h2 className="st-card__title" id="st-privacy-title">
                  Who can see your profile
                </h2>
                <p className="st-card__sub">
                  Saved the moment you choose one. This is the only visibility control on your
                  account.
                </p>
              </div>
              <span className="st-tile">
                <Icon path={ICONS.shield} />
              </span>
            </div>

            <fieldset className="st-fieldset" disabled={visibilityMutation.isPending}>
              <legend className="st-sr-only">Profile visibility</legend>

              {VISIBILITY_OPTIONS.map((option) => {
                const locked = Boolean(option.proOnly) && !isPro;
                const selected = currentVisibility === option.value;

                return (
                  <label
                    className={`st-choice${selected ? " st-choice--active" : ""}${
                      locked ? " st-choice--locked" : ""
                    }`}
                    key={option.value}
                  >
                    <input
                      className="st-radio"
                      type="radio"
                      name="st-profile-visibility"
                      value={option.value}
                      checked={selected}
                      disabled={locked}
                      aria-disabled={locked ? "true" : undefined}
                      onChange={() => handleVisibilityChange(option.value)}
                    />
                    <span className="st-choice__body">
                      <span className="st-choice__title">
                        {option.label}
                        {locked ? <span className="st-pill st-pill--accent">Pro only</span> : null}
                        {selected ? <span className="st-pill st-pill--ok">Current</span> : null}
                      </span>
                      <span className="st-choice__sub">
                        {option.description}
                        {locked
                          ? " Available on a Pro plan — the server rejects this option for free accounts."
                          : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <p className="st-hint">
              {visibilityMutation.isPending ? "Saving your choice…" : "Changes apply immediately."}
            </p>
          </section>

          {/* ---- Billing ------------------------------------------------------------------ */}
          <section
            className="st-card"
            id="st-billing"
            ref={registerSection("st-billing")}
            tabIndex={-1}
            aria-labelledby="st-billing-title"
          >
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow">Billing</p>
                <h2 className="st-card__title" id="st-billing-title">
                  Your plan
                </h2>
                <p className="st-card__sub">
                  Pro is bought a term at a time. Nothing is charged automatically and no card is
                  kept on file.
                </p>
              </div>
              <span className="st-tile">
                <Icon path={ICONS.card} />
              </span>
            </div>

            {subscriptionQuery.isLoading ? (
              <p className="st-empty">Loading your subscription…</p>
            ) : subscriptionQuery.isError ? (
              <p className="st-error">
                {subscriptionQuery.error?.message || "Could not load your subscription."}
              </p>
            ) : (
              <div className="st-plan">
                <div className="st-plan__head">
                  <div>
                    <p className="st-plan__eyebrow">Current plan</p>
                    <p className="st-plan__name">
                      {isPro ? activePlan?.label || "Pro" : "Free"}
                    </p>
                  </div>
                  <span className="st-plan__status">
                    {isPro ? subscription?.status || "Active" : "Free plan"}
                  </span>
                </div>

                <p className="st-plan__price">
                  {isPro && planPrice ? (
                    <>
                      {planPrice}
                      {planPeriod ? <span className="st-plan__period"> / {planPeriod}</span> : null}
                    </>
                  ) : isPro ? (
                    // isPro with no matching plan row: real state, unknown amount. Say so rather
                    // than printing a number this page cannot source.
                    <span className="st-plan__period">Plan amount unavailable</span>
                  ) : (
                    <>
                      Free
                      <span className="st-plan__period"> — no payment on this account</span>
                    </>
                  )}
                </p>

                <p className="st-plan__meta">
                  {isPro
                    ? accessUntil
                      ? `Pro access runs until ${accessUntil}. It will not renew on its own — buy another term before then to stay on Pro.`
                      : "Pro access is active. No end date is recorded on your account."
                    : "Upgrade to unlock auto-apply, AI resume generation, recruiter intros and connections-only profile visibility."}
                </p>

                {latestPayment ? (
                  <p className="st-plan__meta st-plan__meta--dim">
                    Last payment
                    {latestPaymentAmount ? ` ${latestPaymentAmount}` : ""}
                    {latestPaymentDate ? ` on ${latestPaymentDate}` : ""}
                    {latestPayment.status ? ` · ${latestPayment.status}` : ""}
                  </p>
                ) : null}

                <Link className="st-btn st-btn--on-dark" to="/upgrade">
                  {isPro ? "Manage plan" : "Upgrade to Pro"}
                </Link>
              </div>
            )}

            <p className="st-hint">
              Card details are not shown because none are stored — payments go straight to the
              gateway and nothing about the instrument comes back to us.
            </p>
          </section>

          {/* ---- Integrations ------------------------------------------------------------- */}
          <section
            className="st-card"
            id="st-integrations"
            ref={registerSection("st-integrations")}
            tabIndex={-1}
            aria-labelledby="st-integrations-title"
          >
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow">Integrations</p>
                <h2 className="st-card__title" id="st-integrations-title">
                  Connected accounts
                </h2>
                <p className="st-card__sub">
                  LinkedIn is the only account you can authorise. GitHub and your portfolio are
                  links you enter under Account — nothing is connected on your behalf.
                </p>
              </div>
              <span className="st-tile">
                <Icon path={ICONS.plug} />
              </span>
            </div>

            <ul className="st-rows">
              <li className="st-row">
                <span className="st-tile st-tile--muted">
                  <Icon path={ICONS.linkedin} />
                </span>
                <div className="st-row__text">
                  <p className="st-row__title">
                    LinkedIn
                    {linkedinConnected ? <span className="st-pill st-pill--ok">Connected</span> : null}
                  </p>
                  <p className="st-row__sub">
                    {linkedinQuery.isLoading
                      ? "Checking your connection…"
                      : linkedinQuery.isError
                        ? linkedinQuery.error?.message || "Could not check your LinkedIn connection."
                        : linkedinConnected
                          ? `${linkedinStatus?.displayName ? `${linkedinStatus.displayName} · ` : ""}${
                              formatDate(linkedinStatus?.connectedAt)
                                ? `connected ${formatDate(linkedinStatus.connectedAt)}`
                                : "connected"
                            }${
                              linkedinStatus?.canPost
                                ? " · can publish drafted posts to your feed"
                                : " · identity only, reconnect to allow publishing posts"
                            }`
                          : "Verifies who you are on LinkedIn and lets you publish a drafted post to your own feed. It cannot send connection requests or read your messages — LinkedIn does not offer that to apps outside its partner programme."}
                  </p>
                </div>
                <div className="st-row__control">
                  {linkedinConnected ? (
                    <button
                      className="st-btn st-btn--sm st-btn--danger"
                      type="button"
                      onClick={handleDisconnectLinkedIn}
                      disabled={disconnectLinkedInMutation.isPending}
                    >
                      {disconnectLinkedInMutation.isPending ? "Disconnecting…" : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      className="st-btn st-btn--sm st-btn--primary"
                      type="button"
                      onClick={handleConnectLinkedIn}
                      disabled={linkedinQuery.isLoading || !token}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </li>
            </ul>
          </section>

          {/* ---- Danger zone -------------------------------------------------------------- */}
          <section className="st-card st-card--danger" aria-labelledby="st-danger-title">
            <div className="st-card__head">
              <div>
                <p className="st-eyebrow st-eyebrow--danger">Danger zone</p>
                <h2 className="st-card__title" id="st-danger-title">
                  End your session
                </h2>
              </div>
            </div>

            <ul className="st-rows">
              <li className="st-row">
                <span className="st-tile st-tile--muted">
                  <Icon path={ICONS.logout} />
                </span>
                <div className="st-row__text">
                  <p className="st-row__title">Sign out</p>
                  <p className="st-row__sub">
                    Clears your session from this browser. Signing in again restores everything.
                  </p>
                </div>
                <div className="st-row__control">
                  <button className="st-btn st-btn--danger" type="button" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              </li>
            </ul>

            <p className="st-hint">
              There is no delete-account button here because there is no endpoint behind one.
              Removing a seeker touches applications recruiters have already received, sent
              introductions, chat history, posts and connections, so it needs a deliberate
              retention decision rather than a button. Ask through{" "}
              <Link className="st-link" to="/pro/help">
                Help &amp; feedback
              </Link>{" "}
              and it is handled as a support request.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
