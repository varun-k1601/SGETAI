const { GoogleGenAI } = require("@google/genai");
const { computeCandidateMatch, computeResumeJobMatch, tagFromScore } = require("./matchService");
const {
  buildLatexResumeFromTemplate,
  buildTargetedResumeObjective,
  postProcessLatexResume
} = require("./resumeGenerationService");

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

function parseJsonResponse(text, fallback) {
  if (!text) {
    return fallback;
  }

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch (error) {
    return fallback;
  }
}

async function evaluatePreApply(seekerText, jobText, fallbackContext = null) {
  const heuristic = fallbackContext
    ? computeCandidateMatch(fallbackContext.seeker, fallbackContext.job)
    : { score: 0, tag: "Low fit" };
  const deterministicScore = Math.max(0, Math.min(100, Math.round(Number(heuristic.score) || 0)));
  const fallback = {
    score: deterministicScore,
    isLowMatch: deterministicScore < 40,
    matchQuality: tagFromScore(deterministicScore),
    warningMessage: deterministicScore < 40
      ? "This looks like a lower-match role based on your current profile, submitted evidence, and job requirements."
      : deterministicScore < 60
        ? "This is a moderate match. Improve the resume before applying if you want a stronger shortlist chance."
        : "This is a reasonable match. Tailor the resume to the job before applying.",
    actionableAdvice: heuristic.suggestions?.length
      ? heuristic.suggestions
      : deterministicScore < 80
        ? ["Align your resume with the job requirements.", "Highlight the most relevant skills and projects first."]
        : ["You appear well aligned. Emphasize your strongest matching experience."],
    scoringSource: "computeCandidateMatch",
    reasoning: heuristic.reasoning || {}
  };

  try {
    const ai = getClient();
    if (!ai) {
      return fallback;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0,
        topP: 1,
        seed: 42,
        responseMimeType: "application/json"
      },
      contents: `
You are a career assistant. Return strict JSON with keys:
warningMessage, actionableAdvice.

The deterministic score below is already final. Do not create a new score.
Only explain the result and give practical resume/profile improvement advice.
The same balanced ATS mechanism is used elsewhere in this product:
- skills and related skill families
- project/experience evidence
- role/domain similarity
- job responsibilities and keywords
- education and experience-year requirements

Candidate:
${seekerText}

Job:
${jobText}

Deterministic baseline:
${JSON.stringify(heuristic)}
`
    });

    const parsed = parseJsonResponse(response?.text, fallback);

    return {
      ...fallback,
      warningMessage: parsed.warningMessage || fallback.warningMessage,
      actionableAdvice: Array.isArray(parsed.actionableAdvice) && parsed.actionableAdvice.length
        ? parsed.actionableAdvice.map((item) => String(item).trim()).filter(Boolean)
        : fallback.actionableAdvice
    };
  } catch (error) {
    return fallback;
  }
}

function compactProfileForResume(profile = {}) {
  return {
    currentStatus: profile.currentStatus,
    education: {
      universityName: profile.universityName,
      degree: profile.degree,
      major: profile.major,
      graduationYear: profile.graduationYear,
      currentGPA: profile.currentGPA,
      history: (profile.education || []).map((item) => ({
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        startDate: item.startDate,
        endDate: item.endDate
      }))
    },
    skillGroups: (profile.skillGroups || []).map((group) => ({
      category: group.category,
      skills: group.skills || []
    })),
    skills: profile.skills || [],
    preferredRoles: profile.preferredRoles || [],
    projects: (profile.projects || []).map((project) => ({
      title: project.title,
      description: project.description
    })),
    experience: (profile.experience || []).map((item) => ({
      jobTitle: item.jobTitle,
      companyName: item.companyName,
      description: item.description
    })),
    certifications: (profile.licensesAndCertifications || []).map((item) => ({
      title: item.title,
      description: item.description
    })),
    achievements: (profile.achievements || []).map((item) => ({
      title: item.title,
      description: item.description
    }))
  };
}

function compactJobForResume(job = {}) {
  return {
    title: job.title,
    description: job.description,
    industry: job.industry,
    type: job.type,
    requirements: job.requirements || [],
    skillsRequired: job.skillsRequired || [],
    skills: job.skills || []
  };
}

async function generateResumeObjective(profile, job, fallbackObjective) {
  try {
    const ai = getClient();
    if (!ai) {
      return fallbackObjective;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Write one ATS-friendly resume objective for this candidate and target job.
Return strict JSON only: {"objective":"..."}.

Rules:
- 35 to 55 words.
- Must match the target job title and requirements.
- Use only truthful evidence from the candidate profile.
- Mention the most relevant skill area for the job, such as QA/testing, ML/data, backend/API, frontend/UI, cloud/devops, etc.
- Do not invent companies, degrees, projects, certifications, or experience.
- Do not use first-person pronouns.
- Sort the education entries in REVERSE CHRONOLOGICAL ORDER — most recent degree/institution first, oldest last. Never place an older qualification above a newer one.
- Keep LaTeX resume formatting left-aligned for section headers, right-aligned for education/experience dates, and consistently spaced between sections.
- Write in natural, confident, achievement-oriented resume language. Vary sentence structure and opening phrasing each time rather than defaulting to a generic template. Do NOT reuse the scaffold "[status] candidate targeting [role] roles with strengths in [skills]. Seeking to apply relevant project, experience, and education background to..." — that is a placeholder shape, not a model to imitate.

Candidate profile:
${JSON.stringify(compactProfileForResume(profile))}

Target job:
${JSON.stringify(compactJobForResume(job))}
`
    });

    const parsed = parseJsonResponse(response?.text, { objective: fallbackObjective });
    const objective = String(parsed.objective || "").replace(/\s+/g, " ").trim();
    return objective.length >= 40 ? objective : fallbackObjective;
  } catch (error) {
    return fallbackObjective;
  }
}

// `template` stays in the signature for an explicit override, but every caller now passes null and
// lets the service resolve the layout from options.variant / options.variantSeed. Reading one
// fixed template file per caller is what made "which layout do I get" depend on which entry point
// you came through.
async function generateLatexResume(profile, job, template, options = {}) {
  const fallbackObjective = buildTargetedResumeObjective(profile || {}, job || {});
  const objective = await generateResumeObjective(profile || {}, job || {}, fallbackObjective);
  const latex = buildLatexResumeFromTemplate(profile, job || {}, template, {
    objective,
    omitEmptySections: Boolean(options.omitEmptySections),
    variant: options.variant,
    variantSeed: options.variantSeed
  });
  return postProcessLatexResume(latex);
}

async function generateLinkedInPost(profile, userTopic) {
  try {
    const ai = getClient();
    if (!ai) {
      return null;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0.6,
        responseMimeType: "application/json"
      },
      contents: `
Write one LinkedIn post in the candidate's own voice, based on what they asked for below,
combined ONLY with truthful facts from their profile.
Return strict JSON only: {"post":"..."}.

Rules:
- 80 to 150 words.
- Use only truthful evidence from the candidate profile below. Do not invent achievements,
  companies, metrics, or projects that are not present in the profile.
- If the profile does not contain enough detail to support what the user asked for, write a
  more general post grounded only in what IS present, rather than inventing specifics.
- Plain text with natural line breaks (no markdown headers, no bullet-point asterisks).
- End with at most 3 relevant hashtags, no hashtag spam.
- No first line that just restates "Here is a LinkedIn post" — write the post itself only.

What the user asked for:
${userTopic}

Candidate profile:
${JSON.stringify(compactProfileForResume(profile))}
`
    });

    const parsed = parseJsonResponse(response?.text, null);
    const post = String(parsed?.post || "").trim();
    return post.length >= 40 ? post : null;
  } catch (error) {
    return null;
  }
}

async function generateRecruiterDm(profile, context) {
  try {
    const ai = getClient();
    if (!ai) {
      return null;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0.6,
        responseMimeType: "application/json"
      },
      contents: `
Write one short outreach message the candidate can send to a recruiter, based on the context
below, combined ONLY with truthful facts from their profile.
Return strict JSON only: {"message":"..."}.

Rules:
- 60 to 120 words.
- Warm, specific, and professional in tone — not generic or salesy.
- Use only truthful evidence from the candidate profile below to justify fit. Do not invent
  achievements, companies, metrics, or projects that are not present in the profile.
- If the context below does not clearly name a specific company or role, keep the message
  role-agnostic (e.g. reference the kind of role generally) rather than guessing a company name.
- Plain text, no markdown, no subject line — just the message body.

Context the candidate typed (may mention a company, role, or recruiter name):
${context}

Candidate profile:
${JSON.stringify(compactProfileForResume(profile))}
`
    });

    const parsed = parseJsonResponse(response?.text, null);
    const message = String(parsed?.message || "").trim();
    return message.length >= 30 ? message : null;
  } catch (error) {
    return null;
  }
}

const CAREER_AGENT_GEMINI_MODEL = process.env.CAREER_AGENT_GEMINI_MODEL || "gemini-2.5-flash";
// Gemini is the FIRST provider tried, so an unbounded call here delays Ollama by however long the
// network is willing to hang - which is unbounded, because this SDK applies no timeout of its own.
// A healthy call measures ~11s, so 45s is generous while still leaving room inside the total
// career-agent budget for the Ollama fallback to actually run. See the ladder in ollamaService.
const CAREER_AGENT_GEMINI_TIMEOUT_MS = Number(process.env.CAREER_AGENT_GEMINI_TIMEOUT_MS) || 45000;
// The Gemini API refuses a manually set deadline below 10s outright ("Minimum allowed deadline is
// 10s"), and that refusal is a 400 - which would burn an attempt without ever reaching the model.
// So when the remaining budget is thinner than this we do not pass a deadline down at all; the
// abort signal below still enforces the real ceiling on our side.
const GEMINI_MIN_DEADLINE_MS = 10000;

// Returns { text, failure } to match the Ollama provider, so the caller can tell "the key is
// rejected" (never retry) from "the request timed out" (budget spent) from "it answered with
// nothing" (worth one more attempt).
function classifyGeminiError(error) {
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || "");

  if (error?.name === "AbortError" || /abort|timeout|timed out/i.test(message)) {
    return { kind: "timeout", retryable: false, message: "Gemini did not respond within the time budget." };
  }

  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return { kind: "unauthorized", retryable: false, message: "Gemini rejected the configured API key." };
  }

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
    return { kind: "rate_limited", retryable: false, message: "Gemini quota or rate limit reached." };
  }

  // A 400 is a malformed request. It will be malformed the second time too, so retrying only
  // spends budget the Ollama fallback still needs.
  if (status === 400 || /INVALID_ARGUMENT/i.test(message)) {
    return { kind: "bad_request", retryable: false, message: "Gemini rejected the request as invalid." };
  }

  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network/i.test(message)) {
    return { kind: "unreachable", retryable: false, message: "Gemini is not reachable from this network." };
  }

  return { kind: "error", retryable: true, message: message || "Gemini request failed." };
}

async function generateCareerAgentReply(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { text: null, failure: { kind: "error", retryable: false, message: "Empty prompt." } };
  }

  const ai = getClient();
  if (!ai) {
    return { text: null, failure: { kind: "not_configured", retryable: false, message: "No usable Gemini API key." } };
  }

  const timeoutMs = Number(options.timeoutMs) > 0
    ? Math.min(Number(options.timeoutMs), CAREER_AGENT_GEMINI_TIMEOUT_MS)
    : CAREER_AGENT_GEMINI_TIMEOUT_MS;

  // Both are set deliberately. httpOptions.timeout bounds the HTTP round trip; the abort signal is
  // the belt-and-braces that also unblocks us if the SDK stalls somewhere other than the socket.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  const httpOptions = timeoutMs >= GEMINI_MIN_DEADLINE_MS ? { timeout: timeoutMs } : undefined;

  try {
    console.log(`[Gemini] Career agent (text) request to model: ${CAREER_AGENT_GEMINI_MODEL}, prompt length: ${prompt.length}, timeout: ${(timeoutMs / 1000).toFixed(0)}s`);
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: CAREER_AGENT_GEMINI_MODEL,
      config: {
        temperature: 0.5,
        topP: 0.9,
        abortSignal: controller.signal,
        ...(httpOptions ? { httpOptions } : {})
      },
      contents: prompt.trim()
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Gemini] Career agent (text) completed in ${(elapsed / 1000).toFixed(2)}s`);

    const text = typeof response?.text === "string" ? response.text.trim() : "";
    if (text) {
      return { text, failure: null };
    }

    return { text: null, failure: { kind: "empty", retryable: true, message: "Gemini returned no text." } };
  } catch (error) {
    const failure = classifyGeminiError(error);
    console.error(`[Gemini] Career agent (text) generation failed (${failure.kind}):`, error.message);
    return { text: null, failure };
  } finally {
    clearTimeout(abortTimer);
  }
}

/* STRUCTURED-EXTRACTION COUNTERPART to generateCareerAgentReply above. Same provider, same error
   classification, same { value, failure } contract - but it asks for JSON and hands back a parsed
   object, so resumeProfileParser can put Gemini in front of Ollama without owning two different
   call shapes.

   It exists because the resume parser had no second provider at all. The local model is the only
   thing that ever ran, and on CPU-only hardware a two-page resume is a ~9,700-character prompt
   asking for ~2,000 tokens of JSON: measured here at OVER 280 SECONDS, against a 140s per-attempt
   ceiling. Every real resume therefore fell through both attempts to the regex backstop, and the
   candidate got a draft holding a phone number and nothing else. The same prompt through this
   function measures 25.7s and comes back complete. */
const RESUME_PARSER_GEMINI_MODEL = process.env.RESUME_PARSER_GEMINI_MODEL || CAREER_AGENT_GEMINI_MODEL;
// Longer than the 45s chat ceiling because this asks for far more output: a whole resume as JSON,
// not a paragraph of prose. 25.7s measured on a dense two-page resume, so 60s absorbs a longer
// document and a slow network while still leaving the Ollama fallback a usable slice of the
// parser's total budget. See the ladder in resumeProfileParser.
const RESUME_PARSER_GEMINI_TIMEOUT_MS = Number(process.env.RESUME_PARSER_GEMINI_TIMEOUT_MS) || 60000;

async function generateJsonCompletion(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { json: null, failure: { kind: "error", retryable: false, message: "Empty prompt." } };
  }

  const ai = getClient();
  if (!ai) {
    return { json: null, failure: { kind: "not_configured", retryable: false, message: "No usable Gemini API key." } };
  }

  const timeoutMs = Number(options.timeoutMs) > 0
    ? Math.min(Number(options.timeoutMs), RESUME_PARSER_GEMINI_TIMEOUT_MS)
    : RESUME_PARSER_GEMINI_TIMEOUT_MS;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  const httpOptions = timeoutMs >= GEMINI_MIN_DEADLINE_MS ? { timeout: timeoutMs } : undefined;

  try {
    console.log(`[Gemini] JSON completion request to model: ${RESUME_PARSER_GEMINI_MODEL}, prompt length: ${prompt.length}, timeout: ${(timeoutMs / 1000).toFixed(0)}s`);
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: RESUME_PARSER_GEMINI_MODEL,
      config: {
        // Transcription, not composition. Temperature 0 and a fixed seed keep the same document
        // parsing the same way twice, which is what makes a wrong extraction reproducible instead
        // of a coin flip - and responseMimeType makes the SDK itself reject non-JSON output.
        temperature: 0,
        topP: 1,
        seed: 42,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
        ...(httpOptions ? { httpOptions } : {})
      },
      contents: prompt.trim()
    });

    console.log(`[Gemini] JSON completion finished in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    const text = typeof response?.text === "string" ? response.text.trim() : "";
    if (!text) {
      return { json: null, failure: { kind: "empty", retryable: true, message: "Gemini returned no text." } };
    }

    // parseJsonResponse strips a ```json fence and digs the object out of any surrounding prose,
    // which responseMimeType should make unnecessary but does not guarantee.
    const parsed = parseJsonResponse(text, null);
    if (!parsed || typeof parsed !== "object") {
      return { json: null, failure: { kind: "invalid_json", retryable: true, message: "Gemini returned unparseable JSON." } };
    }

    return { json: parsed, failure: null };
  } catch (error) {
    const failure = classifyGeminiError(error);
    console.error(`[Gemini] JSON completion failed (${failure.kind}):`, error.message);
    return { json: null, failure };
  } finally {
    clearTimeout(abortTimer);
  }
}

module.exports = {
  evaluatePreApply,
  generateLatexResume,
  generateCareerAgentReply,
  generateJsonCompletion,
  generateLinkedInPost,
  generateRecruiterDm,
  hasUsableApiKey
};
