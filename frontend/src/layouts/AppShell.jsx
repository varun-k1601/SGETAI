import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { BrandLogo } from "../components/BrandLogo";
import { CareerAgentWidget } from "../components/CareerAgentWidget";
import { apiBlobRequest, apiRequest } from "../services/api";

// Icons that follow the Lucide stroke-based convention (fill: none, stroked paths) — see
// getIconSvg in frontend/src/pages/pro/AIGeneratorPage.jsx for the same convention. Kept as a
// distinct set so the shared .linkedin-svg-icon fill-based rule (still used by the untouched
// recruiter/admin-only icons below) isn't disturbed for those icons.
const STROKE_STYLE_ICON_NAMES = new Set([
  "home", "user", "bot", "briefcase", "clipboard", "zap", "bell", "book", "help", "settings",
  "layout-grid", "users", "megaphone", "shield-check", "plug", "message-square",
  "gauge", "bar-chart", "dollar-sign", "database"
]);

function NavIcon({ name }) {
  const icons = {
    home: (
      <>
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </>
    ),
    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
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
    briefcase: (
      <>
        <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        <rect width="20" height="14" x="2" y="6" rx="2" />
      </>
    ),
    // Renders as a document/file-text glyph (Applied Jobs) — reuses the same "file-text" path
    // already used by AIGeneratorPage.jsx's getIconSvg for visual consistency.
    clipboard: (
      <>
        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </>
    ),
    zap: (
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    ),
    bell: (
      <>
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </>
    ),
    // Renders as a graduation cap (Learn).
    book: (
      <>
        <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
        <path d="M22 10v6" />
        <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
      </>
    ),
    // Renders as a circle-help glyph (Help & Feedback).
    help: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
    settings: (
      <>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    network: (
      <>
        <circle cx="8" cy="7" r="3" />
        <circle cx="17" cy="7" r="3" />
        <circle cx="8" cy="17" r="3" />
        <circle cx="17" cy="17" r="3" />
      </>
    ),
    jobs: (
      <path d="M9 6V4h6v2h5v15H4V6h5Zm2 0h2V5h-2v1Zm-5 5h12V8H6v3Zm0 2v6h12v-6H6Z" />
    ),
    messaging: (
      <path d="M4 5h16v11H8l-4 4V5Zm4 5.5h2v-2H8v2Zm4 0h2v-2h-2v2Zm4 0h2v-2h-2v2Z" />
    ),
    notifications: (
      <path d="M12 22a2.6 2.6 0 0 0 2.5-2h-5a2.6 2.6 0 0 0 2.5 2ZM5 18h14l-1.8-2.4V11a5.2 5.2 0 0 0-4-5V4a1.2 1.2 0 0 0-2.4 0v2a5.2 5.2 0 0 0-4 5v4.6L5 18Z" />
    ),
    search: (
      <path d="M10.5 4a6.5 6.5 0 0 1 5.1 10.5l4 4-1.6 1.6-4-4A6.5 6.5 0 1 1 10.5 4Zm0 2.2a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6Z" />
    ),
    "layout-grid": (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    megaphone: (
      <>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
    "shield-check": (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    plug: (
      <>
        <path d="M12 22v-5" />
        <path d="M9 8V2" />
        <path d="M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" />
      </>
    ),
    "message-square": (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
    gauge: (
      <>
        <path d="m12 14 4-4" />
        <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      </>
    ),
    "bar-chart": (
      <>
        <line x1="12" x2="12" y1="20" y2="10" />
        <line x1="18" x2="18" y1="20" y2="4" />
        <line x1="6" x2="6" y1="20" y2="16" />
      </>
    ),
    "dollar-sign": (
      <>
        <line x1="12" x2="12" y1="2" y2="22" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
      </>
    ),
  };

  const className = STROKE_STYLE_ICON_NAMES.has(name)
    ? "linkedin-svg-icon linkedin-svg-icon--stroke"
    : "linkedin-svg-icon";

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name]}
    </svg>
  );
}

const seekerNavItems = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/profile", label: "Profile", icon: "user" },
  { to: "/ai", label: "AI Generator", icon: "bot" },
  { to: "/jobs", label: "Jobs", icon: "briefcase" },
  { to: "/applied", label: "Applied Jobs", icon: "clipboard" },
  // Messages is a SHARED seeker surface, not a Pro perk. /chat sits in the plain ProtectedRoute
  // group (isAuthenticated only, no ProRoute) and every endpoint in routes/chat.js is requireAuth
  // only, so a free seeker could always open it by typing the URL — it was simply unlinked for
  // them. Listing it here links the access they already had; it adds no permission.
  { to: "/chat", label: "Messages", icon: "message-square" },
  { to: "/learn", label: "Learn", icon: "book" },
  { to: "/help", label: "Help & Feedback", icon: "help" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const proOnlyNavItems = [
  { to: "/pro/automations", label: "Automations", icon: "zap" },
  { to: "/pro/notifications", label: "Notifications", icon: "bell" },
];

// Where the Pro-only rows splice into the seeker nav. Anchored to a PATH rather than a numeric
// offset: the previous `slice(0, 5)` was a bare literal that silently meant something different
// the moment seekerNavItems changed length — which is exactly what adding Messages to that array
// just did. Anchoring after /chat keeps the Pro block contiguous and still immediately before the
// Learn / Help / Settings tail, where it has always sat.
const PRO_NAV_ANCHOR = "/chat";

function buildNavItems(baseItems, isProSeeker) {
  if (!isProSeeker) {
    return baseItems;
  }

  const anchorIndex = baseItems.findIndex((item) => item.to === PRO_NAV_ANCHOR);
  // If the anchor ever disappears, append rather than drop: a Pro seeker losing Automations and
  // Notifications outright would be a far worse failure than them rendering at the bottom.
  const insertAt = anchorIndex === -1 ? baseItems.length : anchorIndex + 1;

  return [...baseItems.slice(0, insertAt), ...proOnlyNavItems, ...baseItems.slice(insertAt)];
}

const recruiterNavItems = [
  { to: "/recruiter/overview", label: "Overview", icon: "layout-grid" },
  { to: "/recruiter/job-postings", label: "Job Postings", icon: "briefcase" },
  // "Candidates" now points at the cross-job candidate pool. It used to point at
  // /recruiter/applications, which is a JOB PICKER ("Select a job"), not a candidate list — so the
  // label named one thing and led to another, and /recruiter/candidates was unreachable entirely.
  { to: "/recruiter/candidates", label: "Candidates", icon: "users" },
  // "Applications" used to sit here, pointing at /recruiter/applications — a standalone "Select a
  // job" PICKER whose only purpose was to forward to /recruiter/applications/:jobId. It was removed
  // only AFTER that destination gained a real entry point: every row on the Job Postings page now
  // links straight to its own applicant list off the applicant count it was already showing, which
  // is both fewer clicks and the place a recruiter is actually standing when they want it. The
  // picker route stays registered and reachable by URL; it is simply no longer the only way in.
  { to: "/recruiter/company-posts", label: "Company Posts", icon: "megaphone" },
  { to: "/recruiter/background-check", label: "Background Check", icon: "shield-check" },
  { to: "/recruiter/integrations", label: "Integrations", icon: "plug" },
  { to: "/recruiter/messages", label: "Messages", icon: "message-square" },
  { to: "/recruiter/settings", label: "Settings", icon: "settings" },
];

// The admin console workspace. Jobs/Posts/Notifications were dropped from this list — those are
// seeker-facing surfaces an admin rarely operates from, and their routes remain reachable by URL
// (see the comments in routes/AppRouter.jsx). Every entry below has a real route registered in
// the admin block of AppRouter; nothing here leads to NotFoundPage.
const adminNavItems = [
  { to: "/dashboard/overview", label: "Overview", icon: "layout-grid" },
  { to: "/admin/candidates", label: "Candidates", icon: "users" },
  { to: "/admin/applications", label: "Applications", icon: "clipboard" },
  { to: "/admin/recruiter-pipeline", label: "Recruiter pipeline", icon: "gauge" },
  { to: "/admin/skills", label: "Skills & progress", icon: "zap" },
  { to: "/admin/growth", label: "Growth & operations", icon: "bar-chart" },
  { to: "/admin/hrms", label: "HRMS", icon: "briefcase" },
  { to: "/admin/support", label: "Support inbox", icon: "message-square" },
  { to: "/admin/billing", label: "Billing", icon: "dollar-sign" },
  { to: "/admin/api-health", label: "API health", icon: "database" },
];

function getProfileInitial(session) {
  const profile = session?.profile || {};
  const name =
    session?.role === "organization"
      ? profile.companyName
      : `${profile.firstName || ""} ${profile.lastName || ""}`.trim();

  return (name || session?.email || "M").trim()[0]?.toUpperCase() || "M";
}

export function AppShell() {
  const { session, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState("");
  const [navAvatarUrl, setNavAvatarUrl] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const isAdmin = session?.role === "SuperAdmin" || session?.role === "Moderator";
  const isRecruiter = session?.role === "organization";
  const baseNavItems = isAdmin
    ? adminNavItems
    : session?.role === "organization"
      ? recruiterNavItems
      : seekerNavItems;
  const navItems = buildNavItems(baseNavItems, session?.role === "seeker" && session?.isPro);
  const profilePath = isAdmin ? "/dashboard/overview" : "/profile";
  // Where the header bell goes, per role. One expression rather than three buttons.
  //   organization → /recruiter/notifications, its own route inside the recruiter group
  //   seeker       → /notifications, unchanged (the shared ProRoute path it already used)
  //   admin        → /notifications, unchanged — it is their only path, and /recruiter/* would
  //                  bounce them off RoleRoute. (The bell itself is hidden for admins today; the
  //                  branch is kept correct so it stays right if that ever changes.)
  const notificationsPath = isRecruiter ? "/recruiter/notifications" : "/notifications";
  const notificationsQuery = useQuery({
    queryKey: ["notifications", session?.role, "navbar"],
    queryFn: () =>
      apiRequest("/notifications?limit=50", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && !isAdmin),
    refetchInterval: 30000,
  });
  const unreadNotificationCount = (notificationsQuery.data?.notifications || [])
    .filter((notification) => !notification.isRead)
    .length;
  const unreadNotificationLabel = unreadNotificationCount > 9 ? "9+" : String(unreadNotificationCount);
  const profileMediaPath =
    session?.role === "organization"
      ? session?.profile?.logo?.filePath
      : session?.profile?.profilePicture?.filePath;

  useEffect(() => {
    if (!session?.accessToken || !profileMediaPath || isAdmin) {
      setNavAvatarUrl("");
      return undefined;
    }

    let didCancel = false;
    let objectUrl = "";

    apiBlobRequest(`/profile/media/profile-picture?v=${encodeURIComponent(profileMediaPath)}`, {
      token: session.accessToken,
    })
      .then(({ blob }) => {
        if (didCancel) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setNavAvatarUrl(objectUrl);
      })
      .catch(() => {
        if (!didCancel) {
          setNavAvatarUrl("");
        }
      });

    return () => {
      didCancel = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isAdmin, profileMediaPath, session?.accessToken]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuOpen && !event.target.closest('.app-header__right')) {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  function handleGlobalSearch(event) {
    event.preventDefault();
    const query = globalSearch.trim();

    if (!query) {
      return;
    }

    // Jobs is the natural landing page for an ambiguous "find a company or a role" search — it
    // now shows both matching jobs and matching companies (see JobsPage.jsx). People/Connections
    // search is still reachable on its own page, just no longer guessed at from here.
    navigate(`/jobs?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="page-shell">
      {/* Left Sidebar Navigation */}
      {/* Two mutually exclusive modifiers, each gated on a role and each backed by its own block in
          styles.css: --console for admins, --recruiter for organizations. Every rule behind them is
          written under that class, so the SEEKER sidebar still renders off the untouched base
          styling — and so does everything the two modifiers do not explicitly override. */}
      <aside
        className={`app-sidebar ${isAdmin ? "app-sidebar--console" : ""} ${
          isRecruiter ? "app-sidebar--recruiter" : ""
        } ${sidebarCollapsed ? "collapsed" : ""}`.replace(/\s+/g, " ").trim()}
      >
        <div className="sidebar-header">
          <BrandLogo
            isPro={session?.role === "seeker" && session?.isPro}
            subtitle={isAdmin ? "Command centre" : ""}
            variant={isRecruiter ? "recruiter" : "default"}
            // navAvatarUrl is the org's uploaded logo, blob-fetched below from
            // session.profile.logo.filePath. It is "" until that resolves and stays "" if the org
            // has no logo or the fetch failed, which is exactly when the initial should show.
            avatarUrl={isRecruiter ? navAvatarUrl : ""}
            avatarInitial={isRecruiter ? getProfileInitial(session) : ""}
          />
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {/* Section label from the reference. Hidden when collapsed (see the modifier CSS) and
              aria-hidden because the nav already carries its own accessible name. */}
          {isAdmin ? (
            <p className="sidebar-nav__section" aria-hidden="true">
              Workspace
            </p>
          ) : null}
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "sidebar-nav__item active" : "sidebar-nav__item")}
            >
              <span className="sidebar-nav__icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span className="sidebar-nav__label">{item.label}</span>
              {(item.label === "Notifications" || item.to === "/pro/notifications") && unreadNotificationCount > 0 ? (
                <em className="sidebar-nav__badge">{unreadNotificationLabel}</em>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <span>{sidebarCollapsed ? "» Expand" : "« Collapse"}</span>
          </button>
        </div>
      </aside>

      <div className="app-main-wrapper">
        {/* Top Header */}
        <header className="app-header">
          <div className="app-header__search">
            <form onSubmit={handleGlobalSearch}>
              <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.5 4a6.5 6.5 0 0 1 5.1 10.5l4 4-1.6 1.6-4-4A6.5 6.5 0 1 1 10.5 4Zm0 2.2a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6Z" />
              </svg>
              <input
                type="text"
                placeholder="Search people, companies, jobs..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
            </form>
          </div>

          <div className="app-header__right">
            <button
              className="theme-toggle-button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Notifications bell. It adds NO query and NO poll: notificationsQuery above is
                already running on a 30s interval for every non-admin session, and on recruiter
                accounts its result was previously discarded entirely (recruiterNavItems has no
                Notifications entry, so the sidebar badge below never matched). This just surfaces
                data already being fetched.

                Destination is role-aware — see notificationsPath above. Never /pro/notifications
                for a non-seeker: that path sits inside <RoleRoute allowedRoles={["seeker"]}> and
                would bounce an organization.

                HIDDEN FOR ADMINS: notificationsQuery is `enabled: ... && !isAdmin`, so an admin
                bell would read zero permanently. Enabling the query for admins would mean adding
                a 30s poll this task explicitly rules out, and admins already have their own
                support inbox in the console. */}
            {!isAdmin ? (
              <NavLink
                to={notificationsPath}
                className="notifications-bell"
                // Closing the profile menu here is REQUIRED, not defensive: the outside-click
                // handler ignores anything inside .app-header__right, and this link is inside it,
                // so without this the dropdown would stay open on top of the page we navigate to.
                onClick={() => setProfileMenuOpen(false)}
                aria-label={
                  unreadNotificationCount > 0
                    ? `Notifications, ${unreadNotificationCount} unread`
                    : "Notifications"
                }
                title="Notifications"
              >
                <span className="notifications-bell__icon" aria-hidden="true">
                  <NavIcon name="bell" />
                </span>
                {/* The count is never the only signal — the aria-label above carries it in words
                    for anyone who cannot see the badge. aria-live announces the change on poll. */}
                {unreadNotificationCount > 0 ? (
                  <span className="notifications-bell__badge" aria-live="polite">
                    {unreadNotificationLabel}
                  </span>
                ) : null}
              </NavLink>
            ) : null}

            <button
              className="profile-button"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              aria-label="Profile menu"
            >
              <span className="profile-avatar">
                {navAvatarUrl ? (
                  <img src={navAvatarUrl} alt="" />
                ) : (
                  getProfileInitial(session)
                )}
              </span>
            </button>

            {profileMenuOpen && (
              <div className="profile-dropdown">
                <NavLink to={profilePath} onClick={() => setProfileMenuOpen(false)}>
                  {isAdmin ? "Admin dashboard" : "View profile"}
                </NavLink>
                {session?.role === "seeker" ? (
                  <NavLink to="/connections" onClick={() => setProfileMenuOpen(false)}>
                    Connection requests
                  </NavLink>
                ) : null}
                {session?.role === "seeker" && !session?.isPro ? (
                  <NavLink to="/upgrade" onClick={() => setProfileMenuOpen(false)}>
                    Upgrade
                  </NavLink>
                ) : null}
                <div className="profile-dropdown__divider"></div>
                <button
                  type="button"
                  className="profile-dropdown__signout"
                  onClick={logout}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="main-panel">
          <Outlet />
        </main>

        {/* Hidden on /chat — a second floating chat launcher stacked in the same corner as a real
            chat interface's own Send button is redundant UX on top of the visual collision. */}
        {session?.accessToken && location.pathname !== "/chat" ? <CareerAgentWidget /> : null}
      </div>

      {/* Mobile Profile Menu */}
      <div className="mobile-profile-menu">
        <div className="linkedin-me-menu">
          <NavLink
            to={profilePath}
            className={({ isActive }) => (isActive ? "linkedin-nav__item active" : "linkedin-nav__item")}
          >
            <span className="linkedin-me-avatar">
              {navAvatarUrl ? (
                <img src={navAvatarUrl} alt="" />
              ) : (
                getProfileInitial(session)
              )}
            </span>
            <span>Me v</span>
          </NavLink>
          <div className="linkedin-me-menu__dropdown">
            <NavLink to={profilePath}>{isAdmin ? "Admin dashboard" : "View profile"}</NavLink>
            {session?.role === "seeker" ? <NavLink to="/connections">Connection requests</NavLink> : null}
            {session?.role === "seeker" && !session?.isPro ? <NavLink to="/upgrade">Upgrade</NavLink> : null}
            <button type="button" onClick={logout}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
