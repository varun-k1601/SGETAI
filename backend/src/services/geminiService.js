const { GoogleGenAI } = require("@google/genai");
const { computeCandidateMatch } = require("./matchService");

let client = null;

function hasUsableApiKey() {
  const key = process.env.GEMINI_API_KEY || "";
  return Boolean(key) && !key.includes("replace_me");
}

function getClient() {
  if (!hasUsableApiKey()) {
    return null;
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return client;
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
}

function tagFromScore(score) {
  if (score >= 80) {
    return "Strong fit";
  }
  if (score >= 60) {
    return "Good fit";
  }
  if (score >= 40) {
    return "Moderate fit";
  }
  return "Low fit";
}

function parseJsonResponse(text, fallback) {
  if (!text) {
    return fallback;
  }

  try {
    const normalized = text.replace(/```json|```/g, "").trim();
    return JSON.parse(normalized);
  } catch (error) {
    return fallback;
  }
}

function tokenizeRoles(text) {
  const source = String(text || "").toLowerCase();
  const stopwords = new Set([
    "name",
    "tagline",
    "bio",
    "career",
    "objective",
    "current",
    "status",
    "skills",
    "preferred",
    "roles",
    "experience",
    "projects",
    "title",
    "description",
    "location",
    "industry",
    "type",
    "requirements",
    "required",
    "and",
    "work",
    "build",
    "systems",
    "apis"
  ]);

  const phraseMatches = source.match(
    /\b[a-z0-9.+#-]+\s+(developer|engineer|scientist|designer|manager|analyst|architect|consultant|specialist)\b/g
  ) || [];

  const tokenMatches = source
    .split(/[^a-z0-9.+#-]+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));

  return [...new Set([...phraseMatches, ...tokenMatches])];
}

async function generateEmbedding(text) {
  try {
    const ai = getClient();
    if (!ai || !text) {
      return null;
    }

    // "text-embedding-004" has been retired from the Gemini API (404 NOT_FOUND) — this must be
    // one of the models that actually still supports embedContent (see ListModels).
    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
      config: {
        outputDimensionality: 768
      }
    });

    return response?.embeddings?.[0]?.values || null;
  } catch (error) {
    console.error("[generateEmbedding] Failed to generate embedding:", error?.message || error);
    return null;
  }
}

async function evaluateCandidateMatch(candidateText, jobText, fallbackContext = null) {
  const fallback = fallbackContext
    ? computeCandidateMatch(fallbackContext.seeker, fallbackContext.job)
    : { score: 0, tag: "Low fit", reasoning: {} };

  try {
    const ai = getClient();
    if (!ai) {
      return fallback;
    }

    // Only anchor to the deterministic baseline when there's a real one (fallbackContext was
    // provided) — otherwise this instruction would bias the model toward the hardcoded
    // { score: 0 } placeholder used for the freeform ATS-check path, which has no baseline to
    // anchor to at all.
    const anchorInstruction = fallbackContext
      ? `- Use this deterministic baseline as the anchor and only adjust slightly if the evidence supports it:\n${JSON.stringify(fallback)}\n`
      : "";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an ATS evaluator. Return strict JSON with keys: score, tag, reasoning.
Score must be a number from 0 to 100. Tag must be short.

Important scoring rules:
- Compare candidate skills, project keywords, and experience keywords against job required skills, requirements, and job description.
- Do not score only by job title.
- Give credit when a required keyword appears in projects or experience, even if it is not listed in the skills line.
- Penalize missing required skills more than missing generic description words.
${anchorInstruction}
Candidate:
${candidateText}

Job:
${jobText}
`
    });

    const parsed = parseJsonResponse(response?.text, fallback);
    const parsedScore = clampScore(parsed.score);
    const score = fallbackContext
      ? clampScore(parsedScore * 0.35 + fallback.score * 0.65)
      : parsedScore;

    return {
      score,
      tag: tagFromScore(score) || parsed.tag || fallback.tag,
      reasoning: {
        ...(fallback.reasoning || {}),
        aiReasoning: parsed.reasoning || null
      },
      suggestions: fallback.suggestions || []
    };
  } catch (error) {
    return fallback;
  }
}

async function evaluateResumeFileMatch(file, jobText, fallback = { score: 0, tag: "Low fit", reasoning: {} }) {
  const safeFallback = fallback || { score: 0, tag: "Low fit", reasoning: {} };

  try {
    const ai = getClient();
    if (!ai || !file?.buffer || !jobText) {
      return safeFallback;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
You are an ATS resume evaluator. Read the attached resume file directly and compare it against the job description.
Return strict JSON only with keys: score, tag, reasoning, matchedKeywords, missingKeywords.

Scoring rules:
- Score 0-100.
- Use this balanced rubric:
  - Required and closely related skills: 35 points.
  - Project/experience evidence that proves similar work: 25 points.
  - Role/domain similarity: 15 points.
  - Important job keywords and responsibilities: 15 points.
  - Education/certification requirements: 10 points.
- Give partial credit for related skill families. Example: React/Node/Mongo projects are relevant to web/full-stack/backend JDs even if every exact keyword is not repeated.
- Penalize hard mandatory gaps, such as a JD requiring 5 years experience when the resume clearly shows entry-level experience, but do not make the whole score collapse to 0 if skills and projects match.
- Do not output 0 unless the file is unreadable or has almost no relationship to the job.
- Give education credit if the resume satisfies explicit education requirements.
- Ignore generic words like for, years, site, information, technical, job, candidate.
- matchedKeywords and missingKeywords must be specific skills, tools, responsibilities, or qualifications. Do not include generic filler words.
- Calibrate labels as:
  - 80+ Strong fit
  - 60-79 Good fit
  - 40-59 Moderate fit
  - below 40 Low fit

Job:
${jobText}
`
            },
            {
              inlineData: {
                mimeType: file.mimetype || "application/pdf",
                data: file.buffer.toString("base64")
              }
            }
          ]
        }
      ]
    });

    const parsed = parseJsonResponse(response?.text, safeFallback) || safeFallback;
    const score = clampScore(parsed.score);

    return {
      score,
      tag: tagFromScore(score),
      reasoning: parsed.reasoning || null,
      matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : []
    };
  } catch (error) {
    return safeFallback;
  }
}

async function extractHiddenRoles(text) {
  const fallback = tokenizeRoles(text).slice(0, 12);

  try {
    const ai = getClient();
    if (!ai || !text) {
      return fallback;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Extract likely hidden role labels from the following profile or job text.
Return strict JSON in the form {"roles":["frontend developer","data scientist"]}.
Return 3 to 12 concise lowercase role strings only.

Text:
${text}
`
    });

    const parsed = parseJsonResponse(response?.text, { roles: fallback });
    return Array.isArray(parsed.roles) && parsed.roles.length
      ? parsed.roles.map((role) => String(role).trim().toLowerCase()).filter(Boolean).slice(0, 12)
      : fallback;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  generateEmbedding,
  evaluateCandidateMatch,
  evaluateResumeFileMatch,
  extractHiddenRoles,
  hasUsableApiKey
};
