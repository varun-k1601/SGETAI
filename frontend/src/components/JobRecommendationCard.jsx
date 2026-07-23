/**
 * JobRecommendationCard Component
 * Simplified to match actual SgetAI design
 * Shows: Title, Company, Location, Salary, Skills, Match %
 */

import { SkillBadge } from "./SkillBadge";
import { formatSalary as formatSalaryRange } from "../utils/formatSalary";

function formatSalary(salaryRange) {
  if (!salaryRange) return "Not specified";
  if (typeof salaryRange === "string") return salaryRange;
  return formatSalaryRange(salaryRange) || "Not specified";
}

export function JobRecommendationCard({
  job,
  onApply,
  onSkip,
  onViewDetails,
}) {
  const {
    id,
    title,
    company,
    salary,
    skills = [],
    matchPercentage = 0,
    status = "not_applied",
    location = "Remote",
  } = job;

  const isApplied = status === "applied";

  // Match color based on percentage
  let matchBgColor = "bg-green-100";
  let matchTextColor = "text-green-700";

  if (matchPercentage >= 85) {
    matchBgColor = "bg-green-100";
    matchTextColor = "text-green-700";
  } else if (matchPercentage >= 70) {
    matchBgColor = "bg-amber-100";
    matchTextColor = "text-amber-700";
  } else {
    matchBgColor = "bg-orange-100";
    matchTextColor = "text-orange-700";
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 mb-4 hover:shadow-md transition-shadow duration-150">
      {/* Header: Title + Match % Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight flex-1 min-w-0">
          {title}
        </h3>
        {/* Match % - pill badge top-right */}
        <span
          className={`${matchBgColor} ${matchTextColor} px-2 py-1 rounded-full text-xs font-bold shrink-0 whitespace-nowrap`}
        >
          {matchPercentage}%
        </span>
      </div>

      {/* Metadata: Company, Location, Salary */}
      <div className="text-xs text-gray-600 space-y-0.5 mb-3">
        <div>{company}</div>
        <div>{location}</div>
        <div>{formatSalary(salary)}</div>
      </div>

      {/* Skills - Show 3 max with +N indicator */}
      {skills && skills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {skills.slice(0, 3).map((skill, idx) => (
            <SkillBadge key={idx} skill={skill} />
          ))}
          {skills.length > 3 && (
            <span className="inline-block text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
              +{skills.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Actions - Apply link or Auto-applied badge */}
      {isApplied ? (
        <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded">
          ✓ Auto-applied
        </span>
      ) : (
        <button
          onClick={() => onApply?.(id)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
        >
          Apply →
        </button>
      )}
    </div>
  );
}
