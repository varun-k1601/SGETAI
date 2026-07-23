#!/usr/bin/env node

/**
 * RAG Setup Validation Script
 * Checks if all RAG components are properly configured
 */

const fs = require("fs");
const path = require("path");

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m"
};

function log(color, symbol, message) {
  console.log(`${color}${symbol}${COLORS.reset} ${message}`);
}

async function validateRagSetup() {
  console.log(`\n${COLORS.blue}=== RAG SYSTEM VALIDATION ===${COLORS.reset}\n`);

  let allValid = true;

  // 1. Check Models
  log(COLORS.blue, "📋", "Checking Models...");
  const models = ["Resume.js", "ResumeChunk.js"];
  for (const model of models) {
    const modelPath = path.join(__dirname, "..", "models", model);
    if (fs.existsSync(modelPath)) {
      const content = fs.readFileSync(modelPath, "utf8");
      if (content.includes("module.exports")) {
        log(COLORS.green, "✓", `${model} - OK`);
      } else {
        log(COLORS.red, "✗", `${model} - Missing module.exports`);
        allValid = false;
      }
    } else {
      log(COLORS.red, "✗", `${model} - File not found`);
      allValid = false;
    }
  }

  // 2. Check Services
  log(COLORS.blue, "📋", "Checking Services...");
  const services = ["ollamaService.js", "resumeRagService.js"];
  for (const service of services) {
    const servicePath = path.join(__dirname, "..", "services", service);
    if (fs.existsSync(servicePath)) {
      const content = fs.readFileSync(servicePath, "utf8");
      if (content.includes("module.exports")) {
        log(COLORS.green, "✓", `${service} - OK`);
      } else {
        log(COLORS.red, "✗", `${service} - Missing exports`);
        allValid = false;
      }
    } else {
      log(COLORS.red, "✗", `${service} - File not found`);
      allValid = false;
    }
  }

  // 3. Check Controllers
  log(COLORS.blue, "📋", "Checking Controllers...");
  const controllerPath = path.join(__dirname, "..", "controllers", "resumeRagController.js");
  if (fs.existsSync(controllerPath)) {
    const content = fs.readFileSync(controllerPath, "utf8");
    if (content.includes("module.exports")) {
      log(COLORS.green, "✓", "resumeRagController.js - OK");
    } else {
      log(COLORS.red, "✗", "resumeRagController.js - Missing exports");
      allValid = false;
    }
  } else {
    log(COLORS.red, "✗", "resumeRagController.js - File not found");
    allValid = false;
  }

  // 4. Check Routes
  log(COLORS.blue, "📋", "Checking Routes...");
  const routesPath = path.join(__dirname, "..", "routes", "resumeRag.js");
  if (fs.existsSync(routesPath)) {
    const content = fs.readFileSync(routesPath, "utf8");
    if (content.includes("router.post") && content.includes("module.exports")) {
      log(COLORS.green, "✓", "resumeRag.js - OK");
    } else {
      log(COLORS.red, "✗", "resumeRag.js - Missing routes or exports");
      allValid = false;
    }
  } else {
    log(COLORS.red, "✗", "resumeRag.js - File not found");
    allValid = false;
  }

  // 5. Check server.js mounting
  log(COLORS.blue, "📋", "Checking server.js integration...");
  const serverPath = path.join(__dirname, "..", "server.js");
  if (fs.existsSync(serverPath)) {
    const content = fs.readFileSync(serverPath, "utf8");
    if (content.includes("resumeRagRoutes") && content.includes("/api/resume-rag")) {
      log(COLORS.green, "✓", "server.js - Routes mounted correctly");
    } else {
      log(COLORS.red, "✗", "server.js - resumeRagRoutes not mounted");
      allValid = false;
    }
  }

  // 6. Check Application model update
  log(COLORS.blue, "📋", "Checking Application model...");
  const appModelPath = path.join(__dirname, "..", "models", "Application.js");
  if (fs.existsSync(appModelPath)) {
    const content = fs.readFileSync(appModelPath, "utf8");
    if (content.includes("ragAnalysis")) {
      log(COLORS.green, "✓", "Application.js - ragAnalysis field added");
    } else {
      log(COLORS.red, "✗", "Application.js - ragAnalysis field missing");
      allValid = false;
    }
  }

  // 7. Check Dependencies
  log(COLORS.blue, "📋", "Checking Dependencies...");
  const packagePath = path.join(__dirname, "..", "..", "package.json");
  if (fs.existsSync(packagePath)) {
    const content = fs.readFileSync(packagePath, "utf8");
    const pkg = JSON.parse(content);
    if (pkg.dependencies && pkg.dependencies.axios) {
      log(COLORS.green, "✓", "axios - Installed");
    } else {
      log(COLORS.red, "✗", "axios - Not installed");
      allValid = false;
    }
  }

  // 8. Check Environment Variables
  log(COLORS.blue, "📋", "Checking Environment Variables...");
  const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
  const optionalEnvVars = ["OLLAMA_BASE_URL", "OLLAMA_EMBEDDING_MODEL", "OLLAMA_ANALYSIS_MODEL"];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      log(COLORS.green, "✓", `${envVar} - Set`);
    } else {
      log(COLORS.yellow, "⚠", `${envVar} - Not set (required)`);
    }
  }

  for (const envVar of optionalEnvVars) {
    if (process.env[envVar]) {
      log(COLORS.green, "✓", `${envVar} - Set`);
    } else {
      log(COLORS.yellow, "ℹ", `${envVar} - Using default`);
    }
  }

  // Summary
  console.log(`\n${COLORS.blue}=== SUMMARY ===${COLORS.reset}\n`);

  if (allValid) {
    log(COLORS.green, "✓", "All RAG components are properly configured!");
    log(COLORS.green, "✓", "Ready to start the server with: npm run dev");
    console.log(`\n${COLORS.yellow}Next Steps:${COLORS.reset}`);
    console.log("1. Ensure Ollama is running: ollama serve");
    console.log("2. Pull required models:");
    console.log("   ollama pull nomic-embed-text");
    console.log("   ollama pull qwen2.5:7b");
    console.log("3. Start the backend: npm run dev");
    console.log("4. Test at: http://localhost:5173/ats-checker\n");
  } else {
    log(COLORS.red, "✗", "Some RAG components are missing or misconfigured.");
    log(COLORS.red, "✗", "Please check the errors above before starting the server.");
    console.log("");
    process.exit(1);
  }
}

validateRagSetup().catch((error) => {
  log(COLORS.red, "✗", `Validation error: ${error.message}`);
  process.exit(1);
});
