function toYear(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const yearMatch = String(value).match(/\b(19|20)\d{2}\b/);
  return yearMatch ? Number(yearMatch[0]) : null;
}

const DEFAULT_SCHOOLING_YEARS = 10;

function isSchoolEducation(item = {}) {
  const text = [
    item.institution,
    item.degree,
    item.fieldOfStudy
  ].filter(Boolean).join(" ").toLowerCase();

  return /\b(school|ssc|secondary|high school|class\s*(?:1|10|x)|10th|matric|cbse|icse)\b/.test(text);
}

function getEducationDuration(item = {}) {
  const startYear = toYear(item.startDate);
  const endYear = toYear(item.endDate) || toYear(item.graduationYear) || new Date().getFullYear();

  if (!startYear || !endYear || endYear <= startYear) {
    return 0;
  }

  return endYear - startYear;
}

function calculateEducationYears(education = [], options = {}) {
  const includeDefaultSchooling = options.includeDefaultSchooling !== false;
  const entries = Array.isArray(education) ? education : [];
  const hasSchoolEntry = entries.some(isSchoolEducation);
  const schoolingYears = hasSchoolEntry
    ? Math.max(
      ...entries
        .filter(isSchoolEducation)
        .map((item) => getEducationDuration(item) || DEFAULT_SCHOOLING_YEARS),
      DEFAULT_SCHOOLING_YEARS
    )
    : (includeDefaultSchooling ? DEFAULT_SCHOOLING_YEARS : 0);
  const higherEducationYears = entries.reduce((total, item) => {
    if (isSchoolEducation(item)) {
      return total;
    }

    return total + getEducationDuration(item);
  }, 0);

  return schoolingYears + higherEducationYears;
}

function extractRequiredEducationYears(text) {
  const source = String(text || "").toLowerCase();
  const patterns = [
    /(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:full[-\s]?time\s+)?(?:formal\s+)?education/g,
    /(?:full[-\s]?time\s+)?(?:formal\s+)?education\s+(?:of\s+)?(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)/g
  ];

  let requiredYears = 0;

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(source))) {
      requiredYears = Math.max(requiredYears, Number(match[1]) || 0);
    }
  });

  return requiredYears;
}

function extractEducationSection(text) {
  const source = String(text || "");
  const sectionMatch = source.match(/education([\s\S]*?)(experience|projects|technical skills|skills|certifications|achievements|$)/i);
  return sectionMatch ? sectionMatch[1] : source;
}

function calculateEducationYearsFromText(text) {
  const explicitEducationYearsFromSource = String(text || "").match(/\beducation\s+years?\s*:\s*(\d{1,2})\b/i);

  if (explicitEducationYearsFromSource) {
    return Number(explicitEducationYearsFromSource[1]) || DEFAULT_SCHOOLING_YEARS;
  }

  const section = extractEducationSection(text);
  const explicitEducationYears = section.match(/\byears?\s*:\s*(\d{1,2})\b/i);

  if (explicitEducationYears) {
    return Number(explicitEducationYears[1]) || DEFAULT_SCHOOLING_YEARS;
  }

  const ranges = [];
  const rangePattern = /\b((?:19|20)\d{2})\s*(?:--|-|to|–|—)\s*((?:19|20)\d{2}|present)\b/gi;
  let match;

  while ((match = rangePattern.exec(section))) {
    const startYear = Number(match[1]);
    const endYear = match[2].toLowerCase() === "present"
      ? new Date().getFullYear()
      : Number(match[2]);

    if (startYear && endYear && endYear > startYear) {
      ranges.push(endYear - startYear);
    }
  }

  return DEFAULT_SCHOOLING_YEARS + ranges.reduce((total, years) => total + years, 0);
}

module.exports = {
  calculateEducationYears,
  calculateEducationYearsFromText,
  DEFAULT_SCHOOLING_YEARS,
  extractRequiredEducationYears
};
