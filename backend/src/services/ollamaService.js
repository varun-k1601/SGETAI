const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
const ANALYSIS_MODEL = process.env.OLLAMA_ANALYSIS_MODEL || "qwen2.5:7b";

// TIMEOUT LADDER. Each layer must be strictly shorter than the one wrapping it, so the INNERMOST
// one always fires first and the user gets a real error message instead of a dead socket:
//
//   this client (100s)  <  career-agent total budget (120s)  <  nginx proxy_read_timeout (150s)
//                                                            <  browser abort (180s)
//
// This used to be 600000 - ten minutes. Nothing in front of it ever waited that long: nginx caps a
// proxied response at 60s by default, and in dev a nodemon restart destroys the socket outright.
// Either way the browser gets zero bytes and reports "Failed to fetch", which is why the
// rule-based fallback reply was never seen. See CAREER_AGENT_TOTAL_BUDGET_MS in careerAgentService
// and proxy_read_timeout in nginx.conf - change one and you must re-check the rest of the ladder.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 100000;

// THE TOKEN BUDGET HAS TO FIT THE TIME BUDGET. This was 1400, which on CPU-only hardware measured
// 135s for a single career-agent reply - past the 100s ceiling above, so the fallback provider
// timed out every time and the user always got the canned rule-based line. Latency here is mostly
// a fixed prompt-processing cost plus a per-token cost, measured on this box as:
//
//   num_predict 1400 -> 135.6s     700 -> 111.6s     500 -> 92.3s     350 -> 67.2s
//
// Note how flat that curve is: most of the cost is FIXED prompt processing, not per-token, so
// trimming tokens buys headroom against load variance more than it shortens the reply. 400 came
// back in 94.8s on a loaded box - inside the ceiling, but only just. 350 keeps a usable ~225-word
// structured answer (it clears the usability check in careerAgentService: 15+ words AND a bullet,
// heading or bold run) with roughly a third of the budget still in hand.
// Raise it only alongside OLLAMA_TIMEOUT_MS, and only if your hardware is faster.
const CAREER_AGENT_NUM_PREDICT = Number(process.env.CAREER_AGENT_OLLAMA_NUM_PREDICT) || 350;

// Resume parsing and match analysis ask for far more tokens (num_predict 2000) than a chat reply,
// so they get their own, longer ceiling instead of silently inheriting the chat one. They are
// still REQUEST paths, so this stays below nginx's 150s proxy_read_timeout - past that the proxy
// kills the connection first and its CORS-less 504 reaches the browser as "Failed to fetch",
// which is the same failure this whole ladder exists to prevent.
const OLLAMA_ANALYSIS_TIMEOUT_MS = Number(process.env.OLLAMA_ANALYSIS_TIMEOUT_MS) || 140000;

const ollamaClient = axios.create({
  baseURL: OLLAMA_BASE_URL,
  timeout: OLLAMA_TIMEOUT_MS
});

// Callers that retry need to know WHY a call failed: retrying a refused connection four times
// helps nobody, and a timeout means the budget is spent rather than that the model is broken.
function classifyOllamaError(error) {
  const code = error?.code || "";

  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH" || code === "ECONNRESET") {
    return { kind: "unreachable", retryable: false, message: `Ollama is not reachable at ${OLLAMA_BASE_URL} (${code}).` };
  }

  if (code === "ECONNABORTED" || code === "ETIMEDOUT" || error?.name === "CanceledError") {
    return { kind: "timeout", retryable: false, message: `Ollama did not respond within the time budget.` };
  }

  if (error?.response?.status === 404) {
    return { kind: "model_missing", retryable: false, message: `Ollama has no such model pulled. Run: ollama pull <model>` };
  }

  return { kind: "error", retryable: true, message: error?.message || "Ollama request failed." };
}

async function checkOllamaHealth() {
  try {
    const response = await ollamaClient.get("/api/tags", { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.warn("[Ollama] Health check failed:", error.message);
    return false;
  }
}

async function generateEmbedding(text, model = EMBEDDING_MODEL) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  try {
    const response = await ollamaClient.post("/api/embed", {
      model,
      input: text.trim()
    });

    if (response.data && response.data.embeddings && response.data.embeddings.length > 0) {
      const embedding = response.data.embeddings[0];
      if (Array.isArray(embedding) && embedding.length === 768) {
        return embedding;
      }
    }

    console.warn(`[Ollama] Embedding generation returned unexpected format for model ${model}`);
    return null;
  } catch (error) {
    console.error(`[Ollama] Embedding generation failed:`, error.message);
    return null;
  }
}

async function analyzeResumeMatch(jobDescription, retrievedChunks, model = ANALYSIS_MODEL) {
  if (!jobDescription || !Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
    return null;
  }

  const chunkTexts = retrievedChunks.map((chunk) => `[${chunk.sectionType}]\n${chunk.text}`).join("\n\n");

  const prompt = `You are a professional recruiter analyzing a candidate's resume against a job description.

JOB DESCRIPTION:
${jobDescription}

RELEVANT RESUME SECTIONS:
${chunkTexts}

Analyze the match and provide a response in the following JSON format (ONLY JSON, no other text):
{
  "matchScore": <number 0-100>,
  "matchTag": "<string: 'Strong fit', 'Good fit', 'Moderate fit', or 'Low fit'>",
  "skillsMatch": {
    "required": [<list of skills required by job>],
    "found": [<list of skills found in resume>],
    "missing": [<list of required skills NOT found in resume>],
    "matchPercentage": <number 0-100>
  },
  "strengths": [<list of 2-4 strength bullets>],
  "weaknesses": [<list of 2-4 weakness bullets>],
  "recruiterSummary": "<2-3 sentence summary of fit>"
}

IMPORTANT:
- matchScore should reflect how well the resume matches the job
- skillsMatch.required should be EXTRACTED from the job description, not all skills mentioned
- skillsMatch.found should be skills from resume that match required skills
- skillsMatch.missing should be required skills not mentioned in the resume
- matchPercentage = (found.length / required.length) * 100
- strengths and weaknesses should be specific to this candidate and job
- recruiterSummary should be a professional assessment suitable for a recruiter to read
`;

  try {
    const response = await ollamaClient.post("/api/generate", {
      model,
      prompt,
      stream: false,
      format: "json"
    }, { timeout: OLLAMA_ANALYSIS_TIMEOUT_MS });

    if (response.data && response.data.response) {
      try {
        const analysis = JSON.parse(response.data.response);
        return analysis;
      } catch (parseError) {
        console.error("[Ollama] Failed to parse analysis response as JSON:", parseError.message);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("[Ollama] Analysis generation failed:", error.message);
    return null;
  }
}

async function chatWithCareerAgent(prompt, model = ANALYSIS_MODEL) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return null;
  }

  try {
    console.log(`[Ollama] Starting chat request to model: ${model}, prompt length: ${prompt.length}`);
    const startTime = Date.now();

    const response = await ollamaClient.post("/api/generate", {
      model,
      prompt: prompt.trim(),
      stream: false,
      format: "json",
      options: {
        num_predict: 900
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Ollama] Chat request completed in ${(elapsed / 1000).toFixed(2)}s`);

    if (response.data && response.data.response) {
      try {
        const parsed = JSON.parse(response.data.response);
        return parsed;
      } catch (parseError) {
        console.warn("[Ollama] Career agent response not valid JSON, returning raw text:", parseError.message);
        return {
          reply: response.data.response,
          referencedJobs: [],
          focusAreas: [],
          reasoning: "Ollama returned non-JSON response; raw text used."
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[Ollama] Career agent chat failed:", error.message);
    return null;
  }
}

// Career agent replies are detailed markdown prose, NOT JSON. Forcing format:"json"
// on small local models pushes them to satisfy the grammar with a one-line stub, so we
// deliberately request free-form text here and let the caller structure the result.
//
// Returns { text, failure } rather than a bare string|null. The caller retries, and it can only
// decide sensibly whether to retry - or to stop and tell the user something specific - if it knows
// the difference between "nothing is listening on 11434", "the budget ran out" and "the model
// answered with nothing". Collapsing all three to null is what produced four pointless retries
// against a refused connection.
async function generateCareerAgentReply(prompt, model = ANALYSIS_MODEL, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { text: null, failure: { kind: "error", retryable: false, message: "Empty prompt." } };
  }

  // A per-call ceiling below the client default lets the caller hand over whatever is LEFT of the
  // total budget, so one slow provider cannot spend time the next one still needs.
  const timeoutMs = Number(options.timeoutMs) > 0
    ? Math.min(Number(options.timeoutMs), OLLAMA_TIMEOUT_MS)
    : OLLAMA_TIMEOUT_MS;

  try {
    console.log(`[Ollama] Career agent (text) request to model: ${model}, prompt length: ${prompt.length}, timeout: ${(timeoutMs / 1000).toFixed(0)}s`);
    const startTime = Date.now();

    const response = await ollamaClient.post("/api/generate", {
      model,
      prompt: prompt.trim(),
      stream: false,
      options: {
        num_predict: CAREER_AGENT_NUM_PREDICT,
        temperature: 0.5,
        top_p: 0.9,
        repeat_penalty: 1.1
      }
    }, { timeout: timeoutMs });

    const elapsed = Date.now() - startTime;
    console.log(`[Ollama] Career agent (text) completed in ${(elapsed / 1000).toFixed(2)}s`);

    if (response.data && typeof response.data.response === "string") {
      return { text: response.data.response.trim(), failure: null };
    }

    return { text: null, failure: { kind: "empty", retryable: true, message: "Ollama returned no text." } };
  } catch (error) {
    const failure = classifyOllamaError(error);
    console.error(`[Ollama] Career agent (text) generation failed (${failure.kind}):`, error.message);
    return { text: null, failure };
  }
}

/* Generic JSON-completion helper. Uses format:"json" so Ollama constrains output to a
   syntactically valid JSON object. Used for structured extraction tasks like parsing a resume
   into profile fields.

   Returns { json, failure } rather than a bare object-or-null, matching generateCareerAgentReply
   and the Gemini provider, so a caller running a provider CHAIN can tell "Ollama is not running"
   (skip straight to the next provider) from "the budget ran out" (stop) from "it answered with
   nonsense" (worth one more attempt). Swallowing all three into `null` is what made the resume
   parser retry a dead local model twice and then report a blank draft as a success.

   `options.timeoutMs` lets a caller with a TOTAL budget hand over whatever it has left instead of
   inheriting the full per-request ceiling. Without it, N attempts cost N x OLLAMA_ANALYSIS_TIMEOUT_MS
   of wall clock - which is exactly how a two-attempt resume parse reached 280s. */
async function generateJsonCompletion(prompt, model = ANALYSIS_MODEL, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { json: null, failure: { kind: "error", retryable: false, message: "Empty prompt." } };
  }

  const timeoutMs = Number(options.timeoutMs) > 0
    ? Math.min(Number(options.timeoutMs), OLLAMA_ANALYSIS_TIMEOUT_MS)
    : OLLAMA_ANALYSIS_TIMEOUT_MS;

  try {
    console.log(`[Ollama] JSON completion request to model: ${model}, prompt length: ${prompt.length}, timeout: ${(timeoutMs / 1000).toFixed(0)}s`);
    const startTime = Date.now();

    const response = await ollamaClient.post("/api/generate", {
      model,
      prompt: prompt.trim(),
      stream: false,
      format: "json",
      options: {
        num_predict: 2000,
        temperature: 0.1
      }
    }, { timeout: timeoutMs });

    const elapsed = Date.now() - startTime;
    console.log(`[Ollama] JSON completion finished in ${(elapsed / 1000).toFixed(2)}s`);

    if (response.data && typeof response.data.response === "string") {
      try {
        return { json: JSON.parse(response.data.response), failure: null };
      } catch (parseError) {
        console.warn("[Ollama] JSON completion returned invalid JSON:", parseError.message);
        return { json: null, failure: { kind: "invalid_json", retryable: true, message: "Ollama returned unparseable JSON." } };
      }
    }

    return { json: null, failure: { kind: "empty", retryable: true, message: "Ollama returned no response body." } };
  } catch (error) {
    const failure = classifyOllamaError(error);
    console.error(`[Ollama] JSON completion failed (${failure.kind}):`, error.message);
    return { json: null, failure };
  }
}

module.exports = {
  OLLAMA_BASE_URL,
  OLLAMA_TIMEOUT_MS,
  OLLAMA_ANALYSIS_TIMEOUT_MS,
  classifyOllamaError,
  checkOllamaHealth,
  generateEmbedding,
  analyzeResumeMatch,
  chatWithCareerAgent,
  generateCareerAgentReply,
  generateJsonCompletion
};
