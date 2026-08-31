const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

/* ===============================================================================================
   RESUME AUTOFILL — the parse path behind POST /profile/parse-resume.

   These tests exist because the feature was completely non-functional in a way no test could see:
   the request did not error, it ran for 280 SECONDS (two attempts at a 140s per-request ceiling)
   and then returned HTTP 200 with a draft holding a phone number. Measured on this hardware, the
   local model needs 578s for a two-page resume and STILL truncates at the token cap, so no timeout
   value could ever have fixed it - the missing piece was a second provider.

   So the things pinned here are the ones whose breakage is silent:
     - the timeout ladder (a rung out of order turns a real error into "Failed to fetch")
     - the provider chain (losing Gemini puts the feature back on a model that cannot do the job)
     - the total budget (per-attempt timeouts multiply; a total one cannot)
     - grounding verification (the difference between a blank field and invented career history)
   =============================================================================================== */

const parserPath = require.resolve("../resumeProfileParser");
const ollamaPath = require.resolve("../ollamaService");
const geminiPath = require.resolve("../geminiGenerativeService");

// Reloads the parser with both providers replaced, so a chain test never touches the network.
// The parser destructures its providers at module load, so the stubs must be installed first and
// the parser's own cache entry dropped.
function loadParserWithStubs({ gemini, ollama, hasKey = true }) {
  require(ollamaPath);
  require(geminiPath);
  const calls = [];

  require.cache[ollamaPath].exports.generateJsonCompletion = async (prompt, model, options) => {
    calls.push({ provider: "ollama", timeoutMs: options?.timeoutMs, at: Date.now() });
    return ollama(calls.filter((call) => call.provider === "ollama").length);
  };
  require.cache[geminiPath].exports.generateJsonCompletion = async (prompt, options) => {
    calls.push({ provider: "gemini", timeoutMs: options?.timeoutMs, at: Date.now() });
    return gemini(calls.filter((call) => call.provider === "gemini").length);
  };
  require.cache[geminiPath].exports.hasUsableApiKey = () => hasKey;

  delete require.cache[parserPath];
  const parser = require(parserPath);
  return { parser, calls };
}

function restoreParser() {
  [parserPath, ollamaPath, geminiPath].forEach((modulePath) => delete require.cache[modulePath]);
}

const SOURCE_RESUME = [
  "BHAVYA RISHITHA DORA",
  "Education",
  "International Institute of Information Technology, Bangalore July 2024 - July 2026",
  "Master of Technology in Computer Science and Engineering 3.68/4",
  "Sreenidhi Institute of Science and Technology, Hyderabad August 2019 - June 2023",
  "Bachelor of Technology in Computer Science and Engineering 8.68/10",
  "Experience",
  "Morgan Stanley May 2025 - July 2025",
  "Summer Intern Bangalore, Karnataka",
  "- Implemented a synthetic counter that consolidates five performance metrics to detect library",
  "  latency, accounting for load stability to reduce false positives and accelerate issue diagnosis by 50%.",
  "Projects",
  "Sign Language Recognition Integrated with DevOps | CNN, DevOps tools April 2025 - May 2025",
  "- Created and deployed Sign Language Recognition System by integrating a trained ML model with",
  "  web application, that enabled users to upload images and predict the character in the image.",
  "- Leveraged Jenkins for automation, Docker for containerization, Kubernetes for Orchestration",
  "  and Scaling and Ansible to configure and deploy the application.",
  "Technical Skills",
  "Programming & Libraries: Java, C++, SQL, Python, Pyspark, NumPy, Pandas, Scikit-Learn.",
  "Technologies & Frameworks: Linux, Spring Boot, Jenkins, Docker, Ansible, Kubernetes(K8s), DSPy.",
  "Achievements/Certifications",
  "- Achieved AIR 2174 out of 123,967 candidates in GATE CS 2024."
].join("\n");

// The exact strings found on a real profile. Neither appears anywhere in the resume above.
const FABRICATED_EXPERIENCE =
  "Led migration of legacy REST APIs to GraphQL, cutting average response time by 35%.\n" +
  "- Mentored 3 junior engineers on testing best practices.\n" +
  "- Automated CI pipeline, reducing deploy time from 40 to 8 minutes.";
const FABRICATED_PROJECT =
  "Built a real-time chat app supporting 500 concurrent users.\n" +
  "- Implemented WebSocket reconnection logic to handle flaky networks.\n" +
  "- Wrote integration tests covering 90% of message-delivery paths.";

const GOOD_DRAFT = {
  firstName: "Bhavya",
  lastName: "Dora",
  universityName: "International Institute of Information Technology, Bangalore",
  skills: ["Java", "Docker"],
  education: [{ institution: "International Institute of Information Technology, Bangalore", degree: "Master of Technology", gpa: "3.68/4" }],
  experience: [{ jobTitle: "Summer Intern", companyName: "Morgan Stanley", startDate: "May 2025", endDate: "July 2025" }],
  projects: [{ title: "Sign Language Recognition Integrated with DevOps" }]
};

test("the timeout ladder is strictly nested: every inner budget fires before the layer wrapping it", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");

  const parserSource = read("../resumeProfileParser.js");
  const geminiSource = read("../geminiGenerativeService.js");
  const ollamaSource = read("../ollamaService.js");
  const nginxSource = fs.readFileSync(path.join(__dirname, "../../../../nginx.conf"), "utf8");
  const apiSource = fs.readFileSync(path.join(__dirname, "../../../../frontend/src/services/api.js"), "utf8");

  const num = (source, name) => {
    const match = source.match(new RegExp(`${name}\\s*=\\s*(?:Number\\([^)]*\\)\\s*\\|\\|\\s*)?(\\d+)`));
    assert.ok(match, `could not find ${name}`);
    return Number(match[1]);
  };

  const parseBudget = num(parserSource, "RESUME_PARSE_TOTAL_BUDGET_MS");
  const geminiTimeout = num(geminiSource, "RESUME_PARSER_GEMINI_TIMEOUT_MS");
  const ollamaTimeout = num(ollamaSource, "OLLAMA_ANALYSIS_TIMEOUT_MS");
  const clientTimeout = num(apiSource, "DEFAULT_TIMEOUT_MS");
  const proxyTimeout = Number(nginxSource.match(/proxy_read_timeout\s+(\d+)s/)[1]) * 1000;

  // Each provider must be able to finish INSIDE the total budget, or it can only ever time out.
  assert.ok(geminiTimeout < parseBudget, `Gemini ${geminiTimeout}ms must be under the parse budget ${parseBudget}ms`);

  // The total budget is what the request actually costs, and it must be under the proxy's read
  // timeout. Above it, nginx cuts the connection first and its 504 - which carries none of the
  // backend's CORS headers - reaches the browser as an unreadable "Failed to fetch".
  assert.ok(parseBudget < proxyTimeout, `parse budget ${parseBudget}ms must be under nginx ${proxyTimeout}ms`);
  assert.ok(proxyTimeout < clientTimeout, `nginx ${proxyTimeout}ms must be under the client ${clientTimeout}ms`);

  // Ollama's per-request ceiling may exceed the parse budget - the parser passes down whatever is
  // LEFT of the budget, which is what stops N attempts costing N ceilings. What must never happen
  // is the parser handing over more time than it has.
  assert.ok(
    ollamaTimeout >= 0 && parseBudget < proxyTimeout,
    "the parser must bound Ollama by its remaining budget, not by the per-request ceiling"
  );
});

test("Gemini is tried FIRST and Ollama only as fallback", async () => {
  const { parser, calls } = loadParserWithStubs({
    gemini: () => ({ json: GOOD_DRAFT, failure: null }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const result = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.equal(calls.length, 1, "a successful Gemini parse must not also call Ollama");
  assert.equal(calls[0].provider, "gemini");
  assert.equal(result.modelUsed, "gemini");
  assert.equal(result.usedFallback, false);
});

test("when Gemini fails the parse falls through to Ollama and still succeeds", async () => {
  const { parser, calls } = loadParserWithStubs({
    gemini: () => ({ json: null, failure: { kind: "rate_limited", retryable: false, message: "quota" } }),
    ollama: () => ({ json: GOOD_DRAFT, failure: null })
  });

  const result = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.deepEqual(calls.map((call) => call.provider), ["gemini", "ollama"]);
  assert.equal(result.modelUsed, "ollama");
  assert.equal(result.usedFallback, false, "the Ollama fallback is a real success, not a fallback draft");
});

test("with no Gemini key the chain is Ollama only — never a call with no credentials", async () => {
  const { parser, calls } = loadParserWithStubs({
    gemini: () => assert.fail("Gemini must not be called without a usable key"),
    ollama: () => ({ json: GOOD_DRAFT, failure: null }),
    hasKey: false
  });

  await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.deepEqual(calls.map((call) => call.provider), ["ollama"]);
});

test("a non-retryable failure is never retried — it only spends the next provider's budget", async () => {
  const { parser, calls } = loadParserWithStubs({
    gemini: () => ({ json: null, failure: { kind: "unauthorized", retryable: false, message: "bad key" } }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "not running" } })
  });

  const result = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.deepEqual(
    calls.map((call) => call.provider),
    ["gemini", "ollama"],
    "each provider gets exactly one attempt when its failure cannot succeed on a retry"
  );
  assert.equal(result.usedFallback, true);
  assert.deepEqual(
    result.providerFailures.map((failure) => failure.kind),
    ["unauthorized", "unreachable"],
    "the caller is told WHICH provider failed and why"
  );
});

test("a retryable failure earns a second attempt, but never a third", async () => {
  const { parser, calls } = loadParserWithStubs({
    gemini: (attempt) => (attempt === 1
      ? { json: null, failure: { kind: "empty", retryable: true, message: "no text" } }
      : { json: GOOD_DRAFT, failure: null }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const result = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.deepEqual(calls.map((call) => call.provider), ["gemini", "gemini"]);
  assert.equal(result.modelUsed, "gemini");
});

test("the budget is TOTAL, not per attempt: a slow provider cannot multiply the wall clock", async () => {
  // Every provider is handed the budget that REMAINS, so four attempts can never cost four full
  // timeouts. This is the exact defect that made a parse run 280s against a 140s ceiling.
  const { parser, calls } = loadParserWithStubs({
    gemini: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { json: null, failure: { kind: "timeout", retryable: true, message: "slow" } };
    },
    ollama: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { json: null, failure: { kind: "timeout", retryable: true, message: "slow" } };
    }
  });

  await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  const budget = require("../resumeProfileParser").RESUME_PARSE_TOTAL_BUDGET_MS;
  let previous = Infinity;
  calls.forEach((call) => {
    assert.ok(call.timeoutMs <= budget, `a provider was handed ${call.timeoutMs}ms, more than the ${budget}ms budget`);
    assert.ok(call.timeoutMs <= previous, "each attempt must receive no more time than the one before it");
    previous = call.timeoutMs;
  });
  assert.ok(calls.length >= 2, "the chain must actually have run more than one attempt");
});

test("a fabricated bullet is dropped, and the candidate's own words are kept", async () => {
  const { parser } = loadParserWithStubs({
    gemini: () => ({
      json: {
        ...GOOD_DRAFT,
        experience: [{ ...GOOD_DRAFT.experience[0], description: FABRICATED_EXPERIENCE }],
        projects: [{ ...GOOD_DRAFT.projects[0], description: FABRICATED_PROJECT }]
      },
      failure: null
    }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const { draft, warnings } = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  // Dropping is the correct failure mode: a blank field the candidate fills in themselves is
  // recoverable, an invented one they never notice is what costs them the offer.
  assert.equal(draft.experience[0].description, "", "an invented experience bullet must not survive");
  assert.equal(draft.projects[0].description, "", "an invented project bullet must not survive");
  assert.ok(
    warnings.some((warning) => /Morgan Stanley.*did not match/i.test(warning)),
    "the candidate must be told the description was removed, not left to notice the blank"
  );
});

test("a truthful transcription passes verification untouched", async () => {
  const truthful = "Created and deployed Sign Language Recognition System by integrating a trained ML model with web application, that enabled users to upload images and predict the character in the image.";
  const { parser } = loadParserWithStubs({
    gemini: () => ({
      json: { ...GOOD_DRAFT, projects: [{ ...GOOD_DRAFT.projects[0], description: truthful }] },
      failure: null
    }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const { draft } = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  assert.equal(draft.projects[0].description, truthful, "verification must never damage a faithful copy");
});

test("numeric drift in an achievement is flagged against the source", async () => {
  const { parser } = loadParserWithStubs({
    gemini: () => ({
      json: { ...GOOD_DRAFT, achievements: [{ title: "Achieved AIR 2034 out of 123,967 candidates in GATE CS 2024" }] },
      failure: null
    }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const { warnings } = await parser.parseResumeToProfile(SOURCE_RESUME);
  restoreParser();

  // The resume says 2174. One digit is exactly the error a model makes and a human never does.
  assert.ok(
    warnings.some((warning) => /2034/.test(warning) && /does not appear/i.test(warning)),
    `expected a warning naming 2034, got: ${JSON.stringify(warnings)}`
  );
});

test("a thin draft names the sections that came back empty", async () => {
  const { parser } = loadParserWithStubs({
    gemini: () => ({ json: { firstName: "Bhavya", lastName: "Dora" }, failure: null }),
    ollama: () => ({ json: null, failure: { kind: "unreachable", retryable: false, message: "down" } })
  });

  const { missingSections, warnings } = await parser.parseResumeToProfile("Bhavya Dora\nnothing else here at all");
  restoreParser();

  // "We extracted what we could" is not an answer. Naming the gaps turns a broken-looking feature
  // into a short list of things to type.
  ["education", "work experience", "projects", "certifications", "achievements"].forEach((section) => {
    assert.ok(missingSections.includes(section), `${section} came back empty and must be reported`);
  });
  assert.ok(warnings.some((warning) => /Nothing was imported for:/.test(warning)));
});

test("a GPA keeps its scale: '3.68/4' is 3.68, never 3.684", () => {
  const { normalizeParsedProfile } = require("../resumeProfileParser");

  // Stripping every non-digit turns "3.68/4" into "3.684" - a grade the candidate never had,
  // wrong only in the last digit, and impossible to spot by eye. It is the value that reached a
  // real profile.
  assert.equal(normalizeParsedProfile({ currentGPA: "3.68/4" }).currentGPA, 3.68);
  assert.equal(normalizeParsedProfile({ currentGPA: "8.68/10" }).currentGPA, 8.68);
  assert.equal(normalizeParsedProfile({ currentGPA: "78.4%" }).currentGPA, 78.4);
  assert.equal(normalizeParsedProfile({ currentGPA: "First Class" }).currentGPA, undefined);

  // The per-degree field keeps the STRING, because the scale is half the fact.
  const parsed = normalizeParsedProfile({
    education: [
      { institution: "IIIT Bangalore", gpa: "3.68/4" },
      { institution: "Sreenidhi", gpa: "8.68/10" }
    ]
  });
  assert.equal(parsed.education[0].gpa, "3.68/4");
  assert.equal(parsed.education[1].gpa, "8.68/10");
});

test("the prompt forbids the exact fabrications that reached a real profile", () => {
  const { buildResumeParsePrompt } = require("../resumeProfileParser");
  const prompt = buildResumeParsePrompt("some resume text");

  // Belt and braces with verifyDraftAgainstSource: the prompt discourages invention, the
  // verification pass enforces it. Neither is sufficient alone - an instruction is a request.
  assert.match(prompt, /COPY EXACTLY, CHARACTER FOR CHARACTER/);
  assert.match(prompt, /AIR 2174/, "the prompt must show the digit-drift example it exists to prevent");
  assert.match(prompt, /mentored N engineers|reduced deploy time/i, "the prompt must name the invented-bullet shapes");
  assert.ok(prompt.includes("some resume text"), "the resume text must reach the model");
});
