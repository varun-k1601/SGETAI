import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { ThemeToggle } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getHomePathForRole } from "../../utils/roleHome";

export function AcceptTeamInvitePage() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({
    type: token ? "" : "error",
    message: token ? "" : "This invite link is missing or invalid. Ask the person who invited you to resend it.",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const uid = useId();
  const formRef = useRef(null);

  // Browser autofill writes straight into the DOM and does not reliably dispatch React's
  // synthetic change event, so state stays "" while the field visibly holds a value. The next
  // render then reconciles the empty state back onto the element and wipes it — which is what
  // makes an autofilled field look frozen. Pull whatever the browser actually put in the DOM
  // back into state so the two can never disagree.
  const syncFromDom = useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const read = (name) => form.elements[name]?.value ?? "";
    setFirstName((current) => (current ? current : read("firstName")));
    setLastName((current) => (current ? current : read("lastName")));
    setPassword((current) => (current ? current : read("newPassword")));
  }, []);

  useEffect(() => {
    // Catches a fill that has already happened by the time React mounts. Autofill arriving LATER
    // is handled by handleAutoFillStart below, not by extending this into a polling loop.
    syncFromDom();
    const timers = [80, 300, 900].map((delay) => window.setTimeout(syncFromDom, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [syncFromDom]);

  // Fires the moment the browser autofills a field — see the onAutoFillStart keyframes in
  // styles.css. This is the only trigger that is accurate whenever autofill actually happens,
  // rather than guessing at it with timers.
  const handleAutoFillStart = useCallback(
    (event) => {
      if (event.animationName === "onAutoFillStart") syncFromDom();
    },
    [syncFromDom]
  );

  // Typing in ONE field re-renders the whole form, and React would write its own (empty) state
  // back over any sibling the browser had filled without telling React — the exact moment the
  // value disappears. Re-reading the siblings in the same batch makes that impossible.
  const handleChange = useCallback(
    (setter) => (event) => {
      setter(event.target.value);
      syncFromDom();
    },
    [syncFromDom]
  );

  async function handleSubmit(event) {
    event.preventDefault();

    // Last line of defence: whatever is on screen at submit time is what gets POSTed, even if
    // the browser filled a field microseconds ago and React has not seen it yet.
    const form = event.currentTarget;
    const submittedFirstName = form.elements.firstName?.value ?? firstName;
    const submittedLastName = form.elements.lastName?.value ?? lastName;
    const submittedPassword = form.elements.newPassword?.value ?? password;

    try {
      setIsSubmitting(true);
      setStatus({ type: "", message: "" });

      const response = await apiRequest("/organization/members/complete-invite", {
        method: "POST",
        body: {
          token,
          firstName: submittedFirstName,
          lastName: submittedLastName,
          password: submittedPassword,
        },
      });

      const nextSession = await completeLogin(response);
      navigate(getHomePathForRole(nextSession.role), { replace: true });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page auth-page--centered">
      <div className="signup-card">
        <div className="signup-card__topbar">
          <BrandLogo />
          <ThemeToggle />
        </div>

        <div className="signup-card__brand">
          <p className="eyebrow">Team invite</p>
          <h1>Set up your account</h1>
          <p>Add your name and choose a password to join your team's hiring workspace.</p>
        </div>

        <AutoDismissFeedback feedback={status} onClear={() => setStatus({ type: "", message: "" })} />

        {/* Every input carries an explicit name + autoComplete. Without them Chrome falls back to
            positional heuristics and pairs the text input immediately preceding a password field
            as the username — which here is Last name, so it filled a saved username into it.
            "new-password" additionally tells the browser this form CREATES a credential, so it
            offers to generate one instead of filling a stored one. */}
        <form className="auth-form signup-form" onSubmit={handleSubmit} ref={formRef}>
          <div className="form-grid">
            <label className="form-field" htmlFor={`${uid}-firstName`}>
              <span>First name</span>
              <input
                id={`${uid}-firstName`}
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={handleChange(setFirstName)}
                onAnimationStart={handleAutoFillStart}
                required
                disabled={!token}
              />
            </label>

            <label className="form-field" htmlFor={`${uid}-lastName`}>
              <span>Last name</span>
              <input
                id={`${uid}-lastName`}
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={handleChange(setLastName)}
                onAnimationStart={handleAutoFillStart}
                disabled={!token}
              />
            </label>
          </div>

          <label className="form-field" htmlFor={`${uid}-newPassword`}>
            <span>Password</span>
            <input
              id={`${uid}-newPassword`}
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={handleChange(setPassword)}
              onAnimationStart={handleAutoFillStart}
              placeholder="At least 8 characters"
              minLength={8}
              required
              disabled={!token}
            />
          </label>

          <button type="submit" disabled={isSubmitting || !token}>
            {isSubmitting ? "Setting up account..." : "Set up account"}
          </button>
        </form>

        <p className="auth-footer">
          Already set up? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
