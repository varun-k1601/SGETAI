require("../config/env");

const mongoose = require("mongoose");
const { connectToDatabase } = require("../config/db");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");

const organizations = [
  {
    companyName: "BluePeak AI",
    email: "hr@bluepeak.ai",
    websiteUrl: "https://bluepeak.ai",
    industry: "Artificial Intelligence",
    companySize: "51-200",
    headquartersLocation: "Bengaluru, India",
    description: "AI product studio building workflow automation tools for modern businesses."
  },
  {
    companyName: "NovaLabs Cloud",
    email: "hiring@novalabs.dev",
    websiteUrl: "https://novalabs.dev",
    industry: "Cloud Infrastructure",
    companySize: "201-500",
    headquartersLocation: "Hyderabad, India",
    description: "Cloud infrastructure company focused on developer platforms and distributed systems."
  },
  {
    companyName: "GreenByte Systems",
    email: "talent@greenbyte.tech",
    websiteUrl: "https://greenbyte.tech",
    industry: "Climate Tech",
    companySize: "51-200",
    headquartersLocation: "Pune, India",
    description: "Climate-tech platform building data products for energy optimization."
  },
  {
    companyName: "FinPilot",
    email: "recruit@finpilot.co",
    websiteUrl: "https://finpilot.co",
    industry: "FinTech",
    companySize: "101-250",
    headquartersLocation: "Mumbai, India",
    description: "FinTech company building secure dashboards and APIs for digital finance teams."
  },
  {
    companyName: "CloudForge Works",
    email: "careers@cloudforge.io",
    websiteUrl: "https://cloudforge.io",
    industry: "SaaS",
    companySize: "51-200",
    headquartersLocation: "Remote",
    description: "Remote-first SaaS team building collaboration and analytics software."
  }
];

const jobs = [
  {
    companyName: "BluePeak AI",
    title: "Frontend Developer",
    location: "Bengaluru",
    industry: "Artificial Intelligence",
    type: "Full-time",
    salary: { min: 900000, max: 1600000, currency: "INR" },
    skillsRequired: ["React", "JavaScript", "REST APIs", "CSS", "State Management"],
    requirements: ["2+ years frontend experience", "Strong React fundamentals", "Ability to build responsive dashboards"],
    hiddenRoles: ["frontend developer", "react developer", "javascript developer", "ui engineer"],
    description:
      "Build responsive AI workflow dashboards using React, JavaScript, REST APIs, reusable components, and accessible UI patterns."
  },
  {
    companyName: "BluePeak AI",
    title: "Machine Learning Engineer",
    location: "Bengaluru",
    industry: "Artificial Intelligence",
    type: "Full-time",
    salary: { min: 1200000, max: 2200000, currency: "INR" },
    skillsRequired: ["Python", "Machine Learning", "NLP", "Vector Search", "MLOps"],
    requirements: ["Experience with ML pipelines", "Python model development", "Comfort with embeddings and evaluation"],
    hiddenRoles: ["machine learning engineer", "ai engineer", "data scientist", "ml engineer"],
    description:
      "Develop NLP workflows, embeddings, model evaluation pipelines, and production ML services for AI-powered enterprise products."
  },
  {
    companyName: "NovaLabs Cloud",
    title: "Backend Node.js Engineer",
    location: "Hyderabad",
    industry: "Cloud Infrastructure",
    type: "Full-time",
    salary: { min: 1000000, max: 1900000, currency: "INR" },
    skillsRequired: ["Node.js", "Express", "MongoDB", "Microservices", "API Design"],
    requirements: ["Build secure APIs", "Work with MongoDB schemas", "Understand background jobs and queues"],
    hiddenRoles: ["backend engineer", "node.js developer", "api engineer", "software engineer"],
    description:
      "Design scalable Node.js APIs, MongoDB models, service integrations, and backend workflows for a cloud developer platform."
  },
  {
    companyName: "NovaLabs Cloud",
    title: "DevOps Engineer",
    location: "Remote",
    industry: "Cloud Infrastructure",
    type: "Remote",
    salary: { min: 1100000, max: 2000000, currency: "INR" },
    skillsRequired: ["Docker", "Kubernetes", "CI/CD", "AWS", "Monitoring"],
    requirements: ["Own deployment pipelines", "Manage cloud infrastructure", "Improve observability"],
    hiddenRoles: ["devops engineer", "cloud engineer", "site reliability engineer", "platform engineer"],
    description:
      "Manage Docker, Kubernetes, CI/CD, AWS infrastructure, monitoring, and reliability workflows for cloud-native products."
  },
  {
    companyName: "GreenByte Systems",
    title: "Data Analyst",
    location: "Pune",
    industry: "Climate Tech",
    type: "Full-time",
    salary: { min: 700000, max: 1300000, currency: "INR" },
    skillsRequired: ["SQL", "Python", "Power BI", "Data Visualization", "Statistics"],
    requirements: ["Analyze product and energy data", "Create dashboards", "Communicate insights clearly"],
    hiddenRoles: ["data analyst", "business analyst", "analytics specialist", "data scientist"],
    description:
      "Analyze climate and energy datasets using SQL, Python, dashboards, statistics, and visualization to support product decisions."
  },
  {
    companyName: "GreenByte Systems",
    title: "Full Stack Developer",
    location: "Pune",
    industry: "Climate Tech",
    type: "Full-time",
    salary: { min: 900000, max: 1700000, currency: "INR" },
    skillsRequired: ["React", "Node.js", "MongoDB", "Express", "API Integration"],
    requirements: ["Build full-stack product features", "Integrate REST APIs", "Work with reusable frontend components"],
    hiddenRoles: ["full stack developer", "mern developer", "react developer", "node.js developer"],
    description:
      "Build full-stack climate-tech features using React, Node.js, Express, MongoDB, API integration, and product-focused UI."
  },
  {
    companyName: "FinPilot",
    title: "Product Designer",
    location: "Mumbai",
    industry: "FinTech",
    type: "Full-time",
    salary: { min: 900000, max: 1800000, currency: "INR" },
    skillsRequired: ["Figma", "UX Research", "Design Systems", "Prototyping", "FinTech UX"],
    requirements: ["Create product flows", "Run user research", "Maintain design systems"],
    hiddenRoles: ["product designer", "ux designer", "ui designer", "design systems specialist"],
    description:
      "Design secure fintech dashboards, user journeys, prototypes, design systems, and research-backed experiences in Figma."
  },
  {
    companyName: "FinPilot",
    title: "QA Automation Engineer",
    location: "Mumbai",
    industry: "FinTech",
    type: "Full-time",
    salary: { min: 800000, max: 1400000, currency: "INR" },
    skillsRequired: ["Selenium", "Playwright", "API Testing", "JavaScript", "Test Automation"],
    requirements: ["Automate regression tests", "Write API tests", "Improve release confidence"],
    hiddenRoles: ["qa automation engineer", "test automation engineer", "software tester", "quality engineer"],
    description:
      "Create automated UI and API tests using Playwright or Selenium, JavaScript, regression suites, and quality dashboards."
  },
  {
    companyName: "CloudForge Works",
    title: "Remote React Engineer",
    location: "Remote",
    industry: "SaaS",
    type: "Remote",
    salary: { min: 1000000, max: 1800000, currency: "INR" },
    skillsRequired: ["React", "TypeScript", "Frontend Architecture", "Testing", "SaaS"],
    requirements: ["Build complex SaaS screens", "Write maintainable frontend code", "Collaborate async"],
    hiddenRoles: ["frontend developer", "react developer", "typescript developer", "frontend engineer"],
    description:
      "Build SaaS frontend architecture with React, TypeScript, component systems, testing, and remote-first collaboration."
  },
  {
    companyName: "CloudForge Works",
    title: "Customer Success Analyst",
    location: "Remote",
    industry: "SaaS",
    type: "Remote",
    salary: { min: 600000, max: 1100000, currency: "INR" },
    skillsRequired: ["Customer Success", "Analytics", "Communication", "SaaS", "SQL"],
    requirements: ["Support SaaS customers", "Analyze product usage", "Communicate insights with clarity"],
    hiddenRoles: ["customer success analyst", "business analyst", "support specialist", "analytics specialist"],
    description:
      "Work with SaaS customers, analyze usage data, build reports, coordinate onboarding, and improve customer outcomes."
  }
];

async function upsertOrganization(data) {
  return Organization.findOneAndUpdate(
    { email: data.email },
    {
      $set: {
        ...data,
        domainMatched: true,
        verificationStatus: "Verified",
        representativeDetails: {
          name: "Dev Recruiter",
          role: "Talent Partner",
          email: data.email,
          phone: "+91 90000 00000"
        }
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
}

async function upsertJob(jobData, organization) {
  return Job.findOneAndUpdate(
    {
      title: jobData.title,
      organizationId: organization._id
    },
    {
      $set: {
        title: jobData.title,
        description: jobData.description,
        organizationId: organization._id,
        location: jobData.location,
        industry: jobData.industry,
        type: jobData.type,
        salary: jobData.salary,
        requirements: jobData.requirements,
        skills: jobData.skillsRequired,
        skillsRequired: jobData.skillsRequired,
        isActive: true,
        status: "Active",
        hiddenRoles: jobData.hiddenRoles
      }
    },
    { new: true, upsert: true, runValidators: true }
  ).select("+hiddenRoles +embedding");
}

(async () => {
  try {
    await connectToDatabase();

    const organizationByName = new Map();
    for (const organizationData of organizations) {
      const organization = await upsertOrganization(organizationData);
      organizationByName.set(organization.companyName, organization);
    }

    const seededJobs = [];
    let autoApplyCreated = 0;

    for (const jobData of jobs) {
      const organization = organizationByName.get(jobData.companyName);
      const job = await upsertJob(jobData, organization);
      const autoApplyResult = await runAutoApplyForJob(job._id);
      autoApplyCreated += autoApplyResult.applicationsCreated;
      seededJobs.push({
        company: jobData.companyName,
        title: job.title,
        id: job._id.toString(),
        hiddenRoles: job.hiddenRoles
      });
    }

    console.log(JSON.stringify({
      ok: true,
      organizationsSeeded: organizations.length,
      jobsSeeded: seededJobs.length,
      autoApplyApplicationsCreated: autoApplyCreated,
      recruiterLoginEmails: organizations.map((organization) => organization.email),
      jobs: seededJobs
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
