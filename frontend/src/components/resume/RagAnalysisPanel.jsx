import { useState } from "react";

function SkillTag({ skill, isFound, isMissing }) {
  let className = "skill-tag";
  if (isFound) className += " skill-tag--found";
  if (isMissing) className += " skill-tag--missing";

  return <span className={className}>{skill}</span>;
}

export function RagAnalysisPanel({ analysis, isLoading = false, error = null }) {
  const [expandedSection, setExpandedSection] = useState(null);

  if (isLoading) {
    return (
      <div className="rag-panel rag-panel--loading">
        <div className="loading-spinner" />
        <p>Analyzing resume match with Ollama AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rag-panel rag-panel--error">
        <span className="error-icon">⚠</span>
        <strong>Analysis Failed</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rag-panel rag-panel--empty">
        <p>No analysis available</p>
      </div>
    );
  }

  const {
    matchScore = 0,
    matchTag = "Low fit",
    skillsMatch = {},
    strengths = [],
    weaknesses = [],
    recruiterSummary = "",
    retrievedChunks = []
  } = analysis;

  const scoreColor = matchScore >= 80 ? "#10b981" : matchScore >= 60 ? "#3b82f6" : matchScore >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="rag-panel">
      {/* Header with Score */}
      <div className="rag-panel__header">
        <div className="match-score-ring">
          <svg viewBox="0 0 100 100" className="score-svg">
            <circle cx="50" cy="50" r="40" className="score-bg" />
            <circle
              cx="50"
              cy="50"
              r="40"
              className="score-progress"
              style={{
                strokeDashoffset: 251.2 - (matchScore / 100) * 251.2,
                stroke: scoreColor
              }}
            />
          </svg>
          <div className="score-text">
            <strong>{Math.round(matchScore)}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="match-info">
          <h3>{matchTag}</h3>
          <p>Resume-to-job AI match score</p>
        </div>
      </div>

      {/* Skills Match Section */}
      <div className="rag-section">
        <h4>Skills Match</h4>
        <div className="skills-match-grid">
          <div className="skills-stat">
            <span className="stat-label">Found</span>
            <span className="stat-value">
              {skillsMatch.found?.length || 0}/{skillsMatch.required?.length || 0}
            </span>
          </div>
          <div className="skills-stat">
            <span className="stat-label">Match %</span>
            <span className="stat-value" style={{ color: scoreColor }}>
              {Math.round(skillsMatch.matchPercentage || 0)}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="skills-progress">
          <div
            className="skills-progress-bar"
            style={{
              width: `${Math.max(0, Math.min(100, skillsMatch.matchPercentage || 0))}%`,
              backgroundColor: scoreColor
            }}
          />
        </div>

        {/* Skills Lists */}
        <div className="skills-lists">
          {skillsMatch.found && skillsMatch.found.length > 0 && (
            <div className="skills-group">
              <p className="skills-group-label">✓ Found Skills</p>
              <div className="skills-tags">
                {skillsMatch.found.map((skill) => (
                  <SkillTag key={skill} skill={skill} isFound />
                ))}
              </div>
            </div>
          )}

          {skillsMatch.missing && skillsMatch.missing.length > 0 && (
            <div className="skills-group">
              <p className="skills-group-label">✗ Missing Skills</p>
              <div className="skills-tags">
                {skillsMatch.missing.map((skill) => (
                  <SkillTag key={skill} skill={skill} isMissing />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strengths Section */}
      {strengths && strengths.length > 0 && (
        <div className="rag-section">
          <h4>Strengths</h4>
          <ul className="bullet-list bullet-list--positive">
            {strengths.map((strength, idx) => (
              <li key={idx}>
                <span className="bullet-icon">✓</span>
                {strength}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses Section */}
      {weaknesses && weaknesses.length > 0 && (
        <div className="rag-section">
          <h4>Weaknesses</h4>
          <ul className="bullet-list bullet-list--negative">
            {weaknesses.map((weakness, idx) => (
              <li key={idx}>
                <span className="bullet-icon">•</span>
                {weakness}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recruiter Summary */}
      {recruiterSummary && (
        <div className="rag-section">
          <h4>Recruiter Summary</h4>
          <p className="summary-text">{recruiterSummary}</p>
        </div>
      )}

      {/* Retrieved Chunks */}
      {retrievedChunks && retrievedChunks.length > 0 && (
        <div className="rag-section">
          <button
            type="button"
            className="chunks-toggle"
            onClick={() =>
              setExpandedSection(expandedSection === "chunks" ? null : "chunks")
            }
          >
            <span>Relevant Resume Sections</span>
            <span className="toggle-icon">
              {expandedSection === "chunks" ? "▼" : "▶"}
            </span>
          </button>

          {expandedSection === "chunks" && (
            <div className="chunks-list">
              {retrievedChunks.map((chunk, idx) => (
                <div key={idx} className="chunk-item">
                  <div className="chunk-header">
                    <span className="chunk-type">{chunk.sectionType}</span>
                    <span className="chunk-score">
                      {Math.round((chunk.relevanceScore || 0) * 100)}% relevant
                    </span>
                  </div>
                  <p className="chunk-text">{chunk.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
