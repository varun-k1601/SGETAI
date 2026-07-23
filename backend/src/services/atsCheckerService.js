const {
  computeResumeJobMatch,
  computeResumeTextMatch,
  getTopKeywords
} = require("./matchService");

function getAtsHeuristic(resumeText, jobText, job = null) {
  if (job) {
    return computeResumeJobMatch(resumeText, job);
  }

  return computeResumeTextMatch(resumeText, jobText);
}

module.exports = {
  getTopKeywords,
  getAtsHeuristic
};
