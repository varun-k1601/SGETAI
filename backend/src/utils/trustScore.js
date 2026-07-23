function getTrustScoreTag(score) {
  if (score >= 85) {
    return "Excellent";
  }
  if (score >= 70) {
    return "Strong";
  }
  if (score >= 50) {
    return "Moderate";
  }
  return "Low";
}

function normalizeManagerRating(input) {
  const value = Math.max(0, Math.min(100, Math.round(Number(input) || 0)));
  return value;
}

module.exports = {
  getTrustScoreTag,
  normalizeManagerRating
};
