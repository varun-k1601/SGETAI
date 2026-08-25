/* Mirrors backend/src/utils/trustScore.js exactly.
 *
 * That function is the authority: submitVerification stores its output on
 * application.trustScoreTag and repeats it to the candidate in the "verification completed"
 * notification. Any second banding in the UI shows a different word for the same number.
 *
 * There WAS one — VerificationSubmitPage had a local getTrustTone() with different labels AND
 * different cut-offs (80/60/40 vs 85/70/50), so a manager who slid to 62 was shown "Positive"
 * while the platform recorded "Moderate", and the recruiter later read "Moderate". Both pages now
 * use this, so the manager sees the label their score will actually carry.
 *
 * Keep the thresholds in step with the backend copy if either ever changes.
 */
export function getTrustScoreTag(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return null;
  }
  if (value >= 85) {
    return "Excellent";
  }
  if (value >= 70) {
    return "Strong";
  }
  if (value >= 50) {
    return "Moderate";
  }
  return "Low";
}

// Visual tone for the tag above. Returns only suffixes that the background-verification pill set
// actually defines — ok (green), progress (teal), warn (red). There is no --danger or --muted
// variant there, and --warn is already painted with --ph-danger, so a fourth name would silently
// fall through to the neutral base pill and render a Low score as if it were unremarkable.
export function getTrustScoreTone(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return "";
  }
  if (value >= 70) {
    return "ok";
  }
  if (value >= 50) {
    return "progress";
  }
  return "warn";
}
