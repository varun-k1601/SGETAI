import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export function SettingsPage() {
  const { session } = useAuth();
  const [formData, setFormData] = useState({
    fullName: session?.profile?.firstName + " " + session?.profile?.lastName || "Alex Rivera",
    email: session?.email || "alex@example.com",
    location: session?.profile?.location || "San Francisco, CA",
    headline: session?.profile?.tagline || "Senior Frontend Engineer",
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    digest: true,
  });

  const [privacy, setPrivacy] = useState({
    stealth: false,
  });

  const [integrations, setIntegrations] = useState({
    linkedin: true,
    github: false,
  });

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const toggleNotification = (key) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const togglePrivacy = (key) => {
    setPrivacy((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleIntegration = (key) => {
    setIntegrations((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const Toggle = ({ enabled, onChange }) => (
    <button
      onClick={onChange}
      className="relative h-6 w-11 shrink-0 rounded-full transition"
      style={{
        background: enabled ? "linear-gradient(90deg, rgb(168, 85, 247), rgb(59, 130, 246))" : "#e5e7eb",
      }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
        style={{
          left: enabled ? "22px" : "2px",
        }}
      ></span>
    </button>
  );

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Settings
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Account &amp; preferences
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* Profile Information */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Account
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                Profile information
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Full name</label>
              <input
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface"
                value={formData.fullName}
                onChange={(e) => handleInputChange("fullName", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface"
                value={formData.email}
                disabled
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <input
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface"
                value={formData.location}
                onChange={(e) => handleInputChange("location", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Headline</label>
              <input
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface"
                value={formData.headline}
                onChange={(e) => handleInputChange("headline", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Notifications
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                What you hear about
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {/* Email Notifications */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              >
                <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Email notifications</p>
                <p className="text-xs text-muted-foreground">Updates on applications and messages.</p>
              </div>
              <Toggle enabled={notifications.email} onChange={() => toggleNotification("email")} />
            </div>

            {/* Push Notifications */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              >
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Push notifications</p>
                <p className="text-xs text-muted-foreground">Real-time alerts in your browser.</p>
              </div>
              <Toggle enabled={notifications.push} onChange={() => toggleNotification("push")} />
            </div>

            {/* Weekly Digest */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              >
                <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Weekly digest</p>
                <p className="text-xs text-muted-foreground">Sunday summary of your matches.</p>
              </div>
              <Toggle enabled={notifications.digest} onChange={() => toggleNotification("digest")} />
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Privacy
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Visibility</h2>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
              className="lucide h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            >
              <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path>
              <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path>
              <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"></path>
              <path d="m2 2 20 20"></path>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Stealth mode</p>
              <p className="text-xs text-muted-foreground">Hide your profile from recruiters at your current company.</p>
            </div>
            <Toggle enabled={privacy.stealth} onChange={() => togglePrivacy("stealth")} />
          </div>
        </div>

        {/* Integrations */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Integrations
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                Connected accounts
              </h2>
            </div>
          </div>

          <div className="space-y-2">
            {/* LinkedIn */}
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4"
                aria-hidden="true"
              >
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect width="4" height="12" x="2" y="9"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
              <p className="flex-1 text-sm font-semibold">LinkedIn</p>
              {integrations.linkedin ? (
                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-success/15 text-success">
                  Connected
                </span>
              ) : (
                <button className="rounded-full px-3 py-1 text-xs font-semibold bg-foreground text-background hover:opacity-90">
                  Connect
                </button>
              )}
            </div>

            {/* GitHub */}
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4"
                aria-hidden="true"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
                <path d="M9 18c-4.51 2-5-2-7-2"></path>
              </svg>
              <p className="flex-1 text-sm font-semibold">GitHub</p>
              {integrations.github ? (
                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-success/15 text-success">
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => toggleIntegration("github")}
                  className="rounded-full px-3 py-1 text-xs font-semibold bg-foreground text-background hover:opacity-90"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
