import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getTrustScoreTag } from "../../utils/trustScore";

export function VerificationSubmitPage() {
  const [searchParams] = useSearchParams();
  // Read once from the URL and held in component state only. It is a BEARER CREDENTIAL: whoever
  // holds it can file a verification against a named candidate, which writes a trust score and
  // can auto-reject their application. It is never rendered - not in a textarea, not read-only,
  // and not in a hidden input a form serialiser could echo back. It travels in the request body.
  const token = searchParams.get("token") || "";
  const hasToken = Boolean(token.trim());
  const [rating, setRating] = useState(80);
  const [feedback, setFeedback] = useState("");
  // `status` stays for TRANSIENT submit results only. The missing-token error is rendered as its
  // own persistent block below: AutoDismissFeedback clears itself after 3 seconds, which for a
  // blocking condition would leave a disabled form with nothing explaining why.
  const [status, setStatus] = useState({ type: "", message: "" });
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trustTone = useMemo(() => getTrustScoreTag(Number(rating)), [rating]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ type: "", message: "" });
    setResult(null);

    // Backstop only - the form is disabled without a token, and the error is already on screen.
    if (!hasToken) {
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiRequest("/verification/submit", {
        method: "POST",
        body: {
          token,
          rating: Number(rating),
          feedback,
        },
      });

      setResult(response);
      setStatus({
        type: "success",
        message: response.message || "Verification submitted successfully.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="verification-shell">
        <header className="landing-login__header">
          <div className="brand-lockup">
            <div className="brand-mark">G</div>
            <div>
              <p className="brand-kicker">SGETAI</p>
              <h1 className="brand-title">Employment verification</h1>
            </div>
          </div>
          <Link to="/login" className="outline-button">
            Platform login
          </Link>
        </header>

        <main className="verification-layout">
          <section className="verification-copy">
            <p className="eyebrow">Manager Submission</p>
            <h1>Submit candidate background feedback securely</h1>
            <p>
              This page is opened from the verification email link. The token in
              the URL identifies the request, so no login is required.
            </p>

            <div className="verification-state-card">
              <strong>Rating guide</strong>
              <p>
                Use a score from 1 to 100 based on your confidence in the
                candidate's employment history and professional performance.
              </p>
            </div>
          </section>

          <aside className="login-panel">
            <div>
              <p className="eyebrow">Verification Form</p>
              <h3>Manager rating</h3>
              <p className="muted">
                Your response updates the candidate trust score for this
                application.
              </p>
            </div>

            {/* Reported at LOAD, not on submit. The old flow let the manager write a full
                assessment and only then told them the link was unusable, discarding it. */}
            {!hasToken ? (
              <div className="feedback-banner error" role="alert">
                This verification link is missing its token. Open the link from the verification
                email exactly as it was sent, or ask the recruiter to resend it.
              </div>
            ) : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Rating: {rating} / 100</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                  disabled={!hasToken}
                />
              </label>

              <div className="metric-list">
                <div>
                  <span>Trust signal</span>
                  <strong>{trustTone}</strong>
                </div>
              </div>

              <label className="form-field">
                <span>Feedback</span>
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  rows={5}
                  placeholder="Share concise employment verification notes."
                  disabled={!hasToken}
                />
              </label>

              <AutoDismissFeedback
                feedback={status}
                onClear={() => setStatus({ type: "", message: "" })}
              />

              {result ? (
                <div className="verification-state-card">
                  <strong>{result.trustScoreTag || "Verification complete"}</strong>
                  <p>
                    Trust score {result.trustScore ?? rating}. Application status:{" "}
                    {result.applicationStatus || "updated"}.
                  </p>
                </div>
              ) : null}

              <button type="submit" disabled={isSubmitting || !hasToken}>
                {isSubmitting ? "Submitting..." : "Submit verification"}
              </button>
            </form>
          </aside>
        </main>
      </div>
    </section>
  );
}
