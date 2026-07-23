// Phase 1 Live Testing Script
// This script simulates what the Career Agent will send to Ollama after Phase 1 improvements

const {
  inferQuestionType,
  buildToolContext,
  compactProfileForAgent,
  compactJobsForAgent,
  compactHistoryForAgent
} = require("../services/careerAgentService");

// We need to get access to buildCareerAgentPrompt - let's reconstruct it here for testing
// Import the formatToolContextForPrompt helper
const fs = require("fs");
const path = require("path");

// Read the service file to extract the prompt function
const servicePath = path.join(__dirname, "../services/careerAgentService.js");
const serviceContent = fs.readFileSync(servicePath, "utf-8");

// Check if Phase 1 improvements are present
console.log("=".repeat(80));
console.log("PHASE 1 LIVE TEST - Verifying Improvements");
console.log("=".repeat(80));

const hasExamples = serviceContent.includes("exampleResponsesByIntent");
const hasEnhancedPrompt = serviceContent.includes("CRITICAL INSTRUCTIONS");
const hasToolFormatter = serviceContent.includes("formatToolContextForPrompt");

console.log("\n✓ Phase 1 Code Changes Verification:");
console.log(`  ${hasExamples ? "✅" : "❌"} Example responses implemented`);
console.log(`  ${hasEnhancedPrompt ? "✅" : "❌"} Enhanced prompt instructions added`);
console.log(`  ${hasToolFormatter ? "✅" : "❌"} Tool context formatter implemented`);

if (!hasExamples || !hasEnhancedPrompt || !hasToolFormatter) {
  console.log("\n⚠️  Some Phase 1 changes are missing. Check careerAgentService.js");
  process.exit(1);
}

console.log("\n" + "=".repeat(80));
console.log("TEST SCENARIOS READY");
console.log("=".repeat(80));

// Create realistic test scenarios
const testScenarios = [
  {
    id: 1,
    name: "General Knowledge - Software Engineer Role",
    message: "What is the role of a software engineer?",
    profile: {
      firstName: "John",
      lastName: "Doe",
      skills: ["JavaScript", "React", "Node.js", "MongoDB", "SQL"],
      preferredRoles: ["Backend Developer", "Full Stack Engineer"],
      experience: [
        { jobTitle: "Junior Developer", companyName: "TechCorp", description: "Built APIs" }
      ],
      education: [{ institution: "MIT", degree: "BS", fieldOfStudy: "Computer Science" }],
      projects: [
        { title: "Job Search Platform", description: "Full stack job board", links: [] }
      ]
    },
    jobs: [
      {
        _id: "job1",
        title: "Backend Engineer",
        organizationId: { companyName: "StartupXYZ" },
        location: "San Francisco",
        type: "Full-time",
        skillsRequired: ["Node.js", "PostgreSQL", "Docker"]
      },
      {
        _id: "job2",
        title: "Full Stack Developer",
        organizationId: { companyName: "TechCorp" },
        location: "Remote",
        type: "Full-time",
        skillsRequired: ["React", "Node.js", "MongoDB"]
      }
    ]
  },
  {
    id: 2,
    name: "Skill Development - Backend with Node.js",
    message: "What skills do I need to learn backend development with Node.js?",
    profile: {
      firstName: "Sarah",
      skills: ["JavaScript", "HTML/CSS", "Basic React"],
      preferredRoles: ["Backend Developer"],
      experience: [],
      education: [{ institution: "Bootcamp", degree: "Certificate", fieldOfStudy: "Web Dev" }],
      projects: [{ title: "Todo App", description: "Simple frontend", links: [] }]
    },
    jobs: [
      {
        _id: "job3",
        title: "Entry Level Backend Dev",
        organizationId: { companyName: "TechStartup" },
        location: "Remote",
        type: "Full-time",
        skillsRequired: ["Node.js", "Express", "MongoDB"]
      }
    ]
  },
  {
    id: 3,
    name: "Job Search - Available Backend Positions",
    message: "Show me backend developer jobs available for someone like me",
    profile: {
      firstName: "Mike",
      skills: ["Node.js", "Express", "MongoDB", "PostgreSQL", "Docker"],
      preferredRoles: ["Backend Engineer"],
      experience: [
        { jobTitle: "Backend Developer", companyName: "WebCorp", description: "API design" }
      ],
      education: [{ institution: "State University", degree: "BS", fieldOfStudy: "CS" }],
      projects: [
        { title: "E-commerce API", description: "REST API with auth", links: [] }
      ]
    },
    jobs: [
      {
        _id: "job4",
        title: "Senior Backend Engineer",
        organizationId: { companyName: "BigTech" },
        location: "San Francisco",
        type: "Full-time",
        skillsRequired: ["Node.js", "PostgreSQL", "Docker", "AWS"]
      },
      {
        _id: "job5",
        title: "Backend Developer",
        organizationId: { companyName: "RemoteFirst" },
        location: "Remote",
        type: "Full-time",
        skillsRequired: ["Node.js", "MongoDB", "REST APIs"]
      },
      {
        _id: "job6",
        title: "Platform Engineer",
        organizationId: { companyName: "CloudStart" },
        location: "New York",
        type: "Full-time",
        skillsRequired: ["Go", "Docker", "Kubernetes", "AWS"]
      }
    ]
  },
  {
    id: 4,
    name: "Resume/ATS - Improve Resume for Backend",
    message: "How can I improve my resume for backend engineering roles?",
    profile: {
      firstName: "Alex",
      skills: ["Node.js", "JavaScript", "MongoDB"],
      preferredRoles: ["Backend Developer"],
      experience: [
        { jobTitle: "Junior Backend Dev", companyName: "Startup", description: "Node API work" }
      ],
      education: [{ institution: "Online Course", degree: "Certification", fieldOfStudy: "Backend" }],
      projects: []
    },
    jobs: []
  },
  {
    id: 5,
    name: "Profile Improvement - What to Complete",
    message: "What should I focus on to improve my profile and get better job matches?",
    profile: {
      firstName: "Emma",
      skills: ["JavaScript"],
      preferredRoles: [],
      experience: [],
      education: [],
      projects: []
    },
    jobs: []
  }
];

// Display test scenarios
console.log("\nTest Scenarios Prepared:\n");
testScenarios.forEach((scenario, idx) => {
  const questionType = inferQuestionType(scenario.message);
  console.log(`${idx + 1}. ${scenario.name}`);
  console.log(`   Question Type: ${questionType.toUpperCase()}`);
  console.log(`   Message: "${scenario.message}"`);
  console.log(`   Profile: ${scenario.profile.firstName}, ${scenario.profile.skills.length} skills`);
  console.log(`   Available Jobs: ${scenario.jobs.length}`);
  console.log();
});

console.log("=".repeat(80));
console.log("NEXT STEPS");
console.log("=".repeat(80));
console.log(`
1. Make sure backend is running:
   - Your backend should be accessible
   - Ollama should still be serving (ollama serve)

2. Test in the UI:
   - Go to your GetAI application
   - Open the Career Agent chat widget
   - Ask one of these 5 questions in order

3. Check response quality:
   - Is the answer 200+ words? (SUCCESS)
   - Is it structured with headers/bullets? (SUCCESS)
   - Does it reference your actual skills/jobs? (SUCCESS)
   - Compare to PHASE1_TESTING_GUIDE.md for expected outputs

4. Document findings:
   - Note the word count of each answer
   - Note if answers include structure
   - Note if answers are personalized
   - Compare to "before" behavior

5. Create a test report:
   - Save the results to PHASE1_TEST_RESULTS.md
   - Include screenshots if possible
   - Rate each answer: ✅ Good, ⚠️ OK, ❌ Failed

QUESTIONS TO TEST:
${testScenarios.map((s, i) => `
${i + 1}. [${inferQuestionType(s.message).toUpperCase()}]
   "${s.message}"`).join("\n")}

Ready to test? 🚀
`);
