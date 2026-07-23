const {
  inferQuestionType,
  selectAgentTools,
  buildFallbackResponse
} = require("../services/careerAgentService");

const sampleProfile = {
  firstName: "Varunraj",
  lastName: "Kasanagottu",
  currentStatus: "Student",
  preferredRoles: ["Frontend Developer", "React Developer", "Full Stack Developer"],
  skills: ["React", "Node.js", "MongoDB", "JavaScript"],
  skillGroups: [
    { category: "Web Development", skills: ["React", "Node.js", "Express", "MongoDB"] }
  ],
  projects: [
    {
      title: "Task Management System",
      description: "Full-stack task app using React, Node.js, Express, and MongoDB."
    }
  ],
  education: [
    {
      institution: "IIIT Hyderabad",
      degree: "MS",
      fieldOfStudy: "Data Science"
    }
  ],
  linkedinUrl: "https://linkedin.com/in/example",
  githubUrl: "https://github.com/example",
  openToWork: true
};

const sampleJobs = [
  {
    _id: "job-backend-1",
    title: "Backend Developer",
    location: "Hyderabad",
    type: "Full-time",
    industry: "Information Technology",
    skillsRequired: ["Node.js", "Express", "MongoDB", "REST API", "JWT"],
    organizationId: { companyName: "SGETAI Labs" }
  },
  {
    _id: "job-react-1",
    title: "React Developer",
    location: "Bengaluru",
    type: "Full-time",
    industry: "SaaS",
    skillsRequired: ["React", "JavaScript", "CSS"],
    organizationId: { companyName: "FrontendWorks" }
  }
];

const sampleApplications = [
  {
    _id: "application-1",
    status: "Pending",
    atsScore: 72,
    atsTag: "Good",
    verificationStatus: "Pending",
    source: "Manual",
    createdAt: new Date(),
    jobId: sampleJobs[0],
    organizationId: sampleJobs[0].organizationId
  }
];

const cases = [
  {
    message: "hi",
    expectedIntent: "greeting",
    expectedTools: [],
    mustInclude: ["Hi"]
  },
  {
    message: "what skills should i develop in order to get backend jobs",
    expectedIntent: "skill_development",
    expectedTools: ["skillRoadmap"],
    forbiddenTools: ["jobSearch"],
    mustInclude: ["backend", "REST"]
  },
  {
    message: "where can i upload my resume",
    expectedIntent: "platform_usage",
    expectedTools: ["platformHelp", "resumeAdvisor"],
    mustInclude: ["Search Jobs", "Attach"]
  },
  {
    message: "what is missing in my profile",
    expectedIntent: "profile_improvement",
    expectedTools: ["profileAnalyzer"],
    mustInclude: ["profile"]
  },
  {
    message: "show me backend jobs in hyderabad",
    expectedIntent: "job_search",
    expectedTools: ["jobSearch"],
    mustInclude: ["Backend"]
  },
  {
    message: "what is my application status",
    expectedTools: ["applicationTracker"],
    mustInclude: ["application"]
  },
  {
    message: "how to prepare for backend interview",
    expectedIntent: "interview_prep",
    expectedTools: ["interviewPrep", "skillRoadmap"],
    mustInclude: ["interview"]
  },
  {
    message: "why is my ATS score low",
    expectedIntent: "resume_or_ats",
    expectedTools: ["resumeAdvisor", "profileAnalyzer"],
    mustInclude: ["ATS"]
  }
];

function includesAll(values, expected) {
  return expected.every((item) => values.includes(item));
}

function excludesAll(values, forbidden = []) {
  return forbidden.every((item) => !values.includes(item));
}

function textIncludesAll(text, expected = []) {
  const normalizedText = String(text || "").toLowerCase();
  return expected.every((item) => normalizedText.includes(String(item).toLowerCase()));
}

function evaluateCase(testCase) {
  const intent = inferQuestionType(testCase.message);
  const tools = selectAgentTools(testCase.message, intent);
  const fallback = buildFallbackResponse(
    testCase.message,
    sampleProfile,
    sampleJobs,
    sampleApplications
  );
  const checks = [
    {
      label: "intent",
      passed: !testCase.expectedIntent || intent === testCase.expectedIntent,
      expected: testCase.expectedIntent,
      actual: intent
    },
    {
      label: "required tools",
      passed: includesAll(tools, testCase.expectedTools || []),
      expected: testCase.expectedTools || [],
      actual: tools
    },
    {
      label: "forbidden tools",
      passed: excludesAll(tools, testCase.forbiddenTools || []),
      expected: testCase.forbiddenTools || [],
      actual: tools
    },
    {
      label: "answer keywords",
      passed: textIncludesAll(fallback.reply, testCase.mustInclude || []),
      expected: testCase.mustInclude || [],
      actual: fallback.reply
    }
  ];

  return {
    message: testCase.message,
    intent,
    tools,
    reply: fallback.reply,
    passed: checks.every((check) => check.passed),
    checks
  };
}

function main() {
  const results = cases.map(evaluateCase);
  const passedCount = results.filter((result) => result.passed).length;

  console.log(`Career Agent Evaluation: ${passedCount}/${results.length} passed\n`);

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.passed ? "PASS" : "FAIL"} - ${result.message}`);
    console.log(`   intent: ${result.intent}`);
    console.log(`   tools: ${result.tools.join(", ") || "none"}`);

    result.checks
      .filter((check) => !check.passed)
      .forEach((check) => {
        console.log(`   failed ${check.label}`);
        console.log(`   expected: ${JSON.stringify(check.expected)}`);
        console.log(`   actual: ${JSON.stringify(check.actual)}`);
      });
  });

  if (passedCount !== results.length) {
    process.exitCode = 1;
  }
}

main();
