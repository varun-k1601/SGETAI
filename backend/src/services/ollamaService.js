const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
const ANALYSIS_MODEL = process.env.OLLAMA_ANALYSIS_MODEL || "qwen2.5:7b";

const ollamaClient = axios.create({
  baseURL: OLLAMA_BASE_URL,
  timeout: 600000  // 10 minutes - career agent prompts can be very large
});

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
    });

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
async function generateCareerAgentReply(prompt, model = ANALYSIS_MODEL) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return null;
  }

  try {
    console.log(`[Ollama] Career agent (text) request to model: ${model}, prompt length: ${prompt.length}`);
    const startTime = Date.now();

    const response = await ollamaClient.post("/api/generate", {
      model,
      prompt: prompt.trim(),
      stream: false,
      options: {
        num_predict: 1400,
        temperature: 0.5,
        top_p: 0.9,
        repeat_penalty: 1.1
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Ollama] Career agent (text) completed in ${(elapsed / 1000).toFixed(2)}s`);

    if (response.data && typeof response.data.response === "string") {
      return response.data.response.trim();
    }

    return null;
  } catch (error) {
    console.error("[Ollama] Career agent (text) generation failed:", error.message);
    return null;
  }
}

// Generic JSON-completion helper. Uses format:"json" so Ollama constrains output to a
// syntactically valid JSON object, and returns the parsed object (or null on failure).
// Used for structured extraction tasks like parsing a resume into profile fields.
async function generateJsonCompletion(prompt, model = ANALYSIS_MODEL) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return null;
  }

  try {
    console.log(`[Ollama] JSON completion request to model: ${model}, prompt length: ${prompt.length}`);
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
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Ollama] JSON completion finished in ${(elapsed / 1000).toFixed(2)}s`);

    if (response.data && typeof response.data.response === "string") {
      try {
        return JSON.parse(response.data.response);
      } catch (parseError) {
        console.warn("[Ollama] JSON completion returned invalid JSON:", parseError.message);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("[Ollama] JSON completion failed:", error.message);
    return null;
  }
}

module.exports = {
  checkOllamaHealth,
  generateEmbedding,
  analyzeResumeMatch,
  chatWithCareerAgent,
  generateCareerAgentReply,
  generateJsonCompletion
};
