import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function getTrustTone(score) {
  if (score >= 80) {
    return "Strong";
  }

  if (score >= 60) {
    return "Positive";
  }

  if (score >= 40) {
    return "Mixed";
  }

  return "Concern";
}

export function VerificationSubmitPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";
  const [token, setToken] = useState(tokenFromUrl);
  const [rating, setRating] = useState(80);
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trustTone = useMemo(() => getTrustTone(Number(rating)), [rating]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ type: "", message: "" });
    setResult(null);

    if (!token.trim()) {
      setStatus({ type: "error", message: "Verification token is missing." });
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

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Secure token</span>
                <textarea
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  rows={4}
                  placeholder="Token from the verification email"
                  required
                />
              </label>

              <label className="form-field">
                <span>Rating: {rating} / 100</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
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

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit verification"}
              </button>
            </form>
          </aside>
        </main>
      </div>
    </section>
  );
}
