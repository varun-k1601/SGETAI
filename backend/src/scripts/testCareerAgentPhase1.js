const {
  inferQuestionType,
  buildToolContext,
  buildFallbackResponse,
  compactProfileForAgent,
  compactJobsForAgent,
  compactHistoryForAgent
} = require("../services/careerAgentService");

// Mock Ollama service to show the prompt being sent
function testPromptGeneration() {
  console.log("=".repeat(80));
  console.log("PHASE 1 TESTING - Career Agent Prompt Improvement");
  console.log("=".repeat(80));

  // Test case 1: Software Engineer role question
  const testMessage1 = "What is the role of a software engineer?";
  const profile1 = {
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
  };

  const jobs1 = [
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
  ];

  console.log("\n📝 TEST 1: General Knowledge Question");
  console.log(`Question: "${testMessage1}"`);
  console.log(`Expected: Detailed answer (200+ words) explaining software engineer roles`);
  console.log(`\nQuestion Type Detected: ${inferQuestionType(testMessage1)}`);
  console.log(`Profile: ${profile1.firstName}, ${profile1.skills.length} skills, ${profile1.preferredRoles.join(", ")}`);
  console.log(`Available Jobs: ${jobs1.length} relevant positions`);

  // Test case 2: Skill development question
  const testMessage2 = "What skills do I need to learn backend development with Node.js?";
  console.log("\n" + "-".repeat(80));
  console.log("📝 TEST 2: Skill Development Question");
  console.log(`Question: "${testMessage2}"`);
  console.log(`Expected: Detailed roadmap with specific technologies and learning path`);
  console.log(`\nQuestion Type Detected: ${inferQuestionType(testMessage2)}`);

  // Test case 3: Job search question
  const testMessage3 = "Show me backend developer jobs available for me";
  console.log("\n" + "-".repeat(80));
  console.log("📝 TEST 3: Job Search Question");
  console.log(`Question: "${testMessage3}"`);
  console.log(`Expected: Detailed job matches with company names, locations, and fit explanations`);
  console.log(`\nQuestion Type Detected: ${inferQuestionType(testMessage3)}`);
  console.log(`Jobs Found: ${jobs1.length}`);
  console.log(`  - ${jobs1[0].title} at ${jobs1[0].organizationId.companyName}`);
  console.log(`  - ${jobs1[1].title} at ${jobs1[1].organizationId.companyName}`);

  // Test case 4: Resume/ATS question
  const testMessage4 = "How can I improve my resume for backend engineering roles?";
  console.log("\n" + "-".repeat(80));
  console.log("📝 TEST 4: Resume/ATS Question");
  console.log(`Question: "${testMessage4}"`);
  console.log(`Expected: Step-by-step guide with specific keywords and optimization tips`);
  console.log(`\nQuestion Type Detected: ${inferQuestionType(testMessage4)}`);
  console.log(`User Skills: ${profile1.skills.join(", ")}`);

  // Test case 5: Profile improvement question
  const testMessage5 = "What should I complete in my profile first?";
  console.log("\n" + "-".repeat(80));
  console.log("📝 TEST 5: Profile Improvement Question");
  console.log(`Question: "${testMessage5}"`);
  console.log(`Expected: Prioritized checklist of profile sections with impact explanation`);
  console.log(`\nQuestion Type Detected: ${inferQuestionType(testMessage5)}`);

  // Build tool context for one example
  const questionType1 = inferQuestionType(testMessage1);
  const toolContext1 = buildToolContext({
    message: testMessage1,
    questionType: questionType1,
    profile: profile1,
    jobs: jobs1,
    applications: []
  });

  console.log("\n" + "=".repeat(80));
  console.log("TOOL CONTEXT ANALYSIS FOR TEST 1");
  console.log("=".repeat(80));
  console.log(`Intent: ${toolContext1.intent}`);
  console.log(`Selected Tools: ${toolContext1.selectedTools.join(", ") || "None"}`);
  if (toolContext1.profileCompleteness) {
    console.log(`Profile Completeness: ${toolContext1.profileCompleteness.score}% (${toolContext1.profileCompleteness.completed.join(", ")})`);
  }

  // Summary of improvements
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1 IMPROVEMENTS IMPLEMENTED");
  console.log("=".repeat(80));
  console.log(`
✅ 1. Example Responses
   - Added 5 intent-specific examples (skill_development, job_search, resume_or_ats, profile_improvement, interview_prep)
   - Each example shows a detailed, well-structured answer that Ollama can learn from

✅ 2. Enhanced Prompt Instructions
   - Expanded from ~50 to ~130 lines of prompt
   - Added explicit minimum word count (200-300 words)
   - Clarified output structure requirements (headers, bullets, numbered lists)
   - Added context-awareness instructions (reference actual user skills, jobs, gaps)

✅ 3. Tool Context Formatting
   - Replaced raw JSON tool outputs with natural language narrative
   - Created formatToolContextForPrompt() to convert tool results into readable context
   - Tool outputs now appear as: "Profile Status: 72% complete. Missing: projects, links."

✅ 4. Better Context Injection
   - Expanded profile context from 5 to 8 top skills
   - Increased history length from 100 to 150 chars per message
   - Increased job context from 2 to 3 jobs

✅ 5. Format Specification
   - Added explicit JSON schema with field requirements
   - Clarified minimum answer length (200-400+ words)
   - Specified focusAreas should have 3-5 items
   - Added reasoning field guidance (1-2 sentences)

NEXT STEPS (Phase 2):
□ Expand profile context further (full career memory, completeness score, education)
□ Include full job descriptions (not just title/company/location)
□ Pass attachment content to model
□ Enhance history context to include intent tags

For testing, run Ollama and query the Career Agent with the questions above.
Expected result: Answers should be 200+ words with structure, not simple 1-2 sentence responses.
  `);

  return {
    testCases: [
      { message: testMessage1, type: inferQuestionType(testMessage1) },
      { message: testMessage2, type: inferQuestionType(testMessage2) },
      { message: testMessage3, type: inferQuestionType(testMessage3) },
      { message: testMessage4, type: inferQuestionType(testMessage4) },
      { message: testMessage5, type: inferQuestionType(testMessage5) }
    ]
  };
}

// Run tests
const results = testPromptGeneration();

console.log("\n" + "=".repeat(80));
console.log("Test Summary: Ready to validate with Ollama");
console.log("=".repeat(80));
console.log(`Total test cases prepared: ${results.testCases.length}`);
console.log("\nTest these questions with Ollama to verify detailed responses:");
results.testCases.forEach((test, i) => {
  console.log(`${i + 1}. [${test.type.toUpperCase()}] ${test.message}`);
});
