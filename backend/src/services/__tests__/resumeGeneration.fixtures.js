/* ===============================================================================================
   Golden-file fixtures for resume generation.
   ===============================================================================================
   These deliberately span the real shapes a production profile takes, not one happy path:
   a student with nothing but projects; a single long role; five short roles; no projects at all;
   missing GPA / location / links; 15 skills vs 60 skills; and a name plus employers carrying
   non-ASCII characters and LaTeX specials (&, %, #, _, $, {, }, backslash, ~, ^).
   =============================================================================================== */

const TARGET_JOB = {
  title: "Software Engineer",
  skillsRequired: ["Java", "Selenium", "Spring Boot", "SQL", "Docker", "Jenkins"],
  requirements: ["Build and maintain automated test suites", "Ship backend services"]
};

const SIXTY_SKILLS = [
  "Java", "Python", "C++", "JavaScript", "TypeScript", "Go", "Rust", "Kotlin", "Swift", "Ruby",
  "React", "Angular", "Vue", "Next.js", "Node.js", "Express.js", "Django", "Flask", "Spring Boot", "Rails",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra", "DynamoDB", "Neo4j", "Elasticsearch", "SQLite", "Snowflake",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "Linux",
  "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "Spark", "Airflow", "Databricks", "NLP", "Computer Vision",
  "Selenium", "Cypress", "Playwright", "JUnit", "pytest", "Jest", "Postman", "Git", "Jira", "Figma"
];

const FIFTEEN_SKILLS = [
  "Java", "Python", "SQL", "Selenium", "Spring Boot", "Docker", "Jenkins", "React",
  "MongoDB", "Git", "Linux", "JUnit", "Machine Learning", "Basics of C++", "Familiar with Kubernetes"
];

const fixtures = [
  {
    name: "student-projects-only",
    description: "No experience at all: a student with projects, coursework and no GPA or links.",
    expect: { minPages: 1, maxPages: 1, hasExperience: false },
    profile: {
      firstName: "Aarti",
      lastName: "Krishnan",
      email: "aarti@example.com",
      phone: "+91 90000 00000",
      currentStatus: "Student",
      universityName: "Indian Institute of Technology, Madras",
      degree: "Bachelor of Technology",
      major: "Computer Science",
      graduationYear: 2027,
      skills: ["Python", "C++", "Data Structures"],
      skillGroups: [{ category: "", skills: ["Python", "C++", "Data Structures"] }],
      education: [
        {
          institution: "Indian Institute of Technology, Madras",
          degree: "Bachelor of Technology",
          fieldOfStudy: "Computer Science",
          startDate: "2023-08-01",
          endDate: "2027-06-01"
        }
      ],
      experience: [],
      projects: [
        {
          title: "Campus Routing Planner",
          description: "Implemented Dijkstra shortest-path routing over the campus map.\nBuilt a Flask API serving 200 requests per minute.",
          repositoryUrl: "https://github.com/aarti/campus-routing",
          startDate: "2025-01-01",
          endDate: "2025-04-01",
          technologies: ["Python", "Flask"]
        }
      ],
      achievements: [],
      licensesAndCertifications: [],
      customSections: [
        {
          title: "Relevant Coursework",
          entries: [
            { title: "Data Structures" }, { title: "Operating Systems" }, { title: "Databases" },
            { title: "Computer Networks" }, { title: "Algorithms" }, { title: "Compilers" }
          ]
        }
      ]
    }
  },

  {
    name: "single-long-role",
    description: "One long role with a five-sentence paragraph description, plus GPA and location.",
    expect: { minPages: 1, maxPages: 2, hasExperience: true },
    profile: {
      firstName: "Daniel",
      lastName: "Okafor",
      email: "daniel@example.com",
      phone: "+1 415 555 0100",
      currentStatus: "Professional",
      linkedinUrl: "https://linkedin.com/in/danielokafor",
      githubUrl: "https://github.com/danielokafor",
      currentGPA: 3.72,
      universityName: "University of Lagos",
      degree: "B.Sc. Computer Science",
      major: "Computer Science",
      skills: FIFTEEN_SKILLS,
      skillGroups: [{ category: "", skills: FIFTEEN_SKILLS }],
      education: [
        { institution: "University of Lagos", degree: "B.Sc. Computer Science", fieldOfStudy: "Computer Science", startDate: "2016-09-01", endDate: "2020-06-01" }
      ],
      experience: [
        {
          companyName: "Paystack",
          jobTitle: "Senior Backend Engineer",
          location: "Lagos, Nigeria",
          startDate: "2020-08-01",
          isCurrent: true,
          description: "Designed and shipped the ledger reconciliation service handling 2.4M transactions per day. Reduced settlement latency from 900ms to 180ms by replacing the batch job with a streaming pipeline. Introduced Docker and Jenkins to the deployment path, cutting release time by 70%. Mentored four engineers through the internal backend curriculum. Owned the on-call rotation for the payments domain."
        }
      ],
      projects: [],
      achievements: [{ title: "Paystack Engineering Award 2023", description: "" }],
      licensesAndCertifications: [{ title: "AWS Certified Solutions Architect", description: "" }]
    }
  },

  {
    name: "five-short-roles",
    description: "Five roles — the limit binds, and the newest must survive even though it is the least relevant to the target job.",
    expect: { minPages: 1, maxPages: 2, hasExperience: true, mustContain: ["Nykaa"] },
    profile: {
      firstName: "Bhavya",
      lastName: "Rao",
      email: "bhavya@example.com",
      phone: "+91 98765 43210",
      currentGPA: 8.68,
      skills: ["Java", "Selenium", "SQL", "Python", "Machine Learning"],
      skillGroups: [{ category: "", skills: ["Java", "Selenium", "SQL", "Python", "Machine Learning"] }],
      education: [
        { institution: "IIIT Bangalore", degree: "M.Tech", fieldOfStudy: "Computer Science", startDate: "2024-07-01", endDate: "2026-07-01" }
      ],
      experience: [
        // Newest, and deliberately IRRELEVANT to the Java/Selenium target job.
        { companyName: "Nykaa", jobTitle: "Data Science Intern", location: "Bengaluru", startDate: "2026-01-01", endDate: "2026-06-01", description: "Built demand forecasting models for beauty SKUs." },
        { companyName: "Morgan Stanley", jobTitle: "Summer Intern", location: "Mumbai", startDate: "2025-05-01", endDate: "2025-07-01", description: "Implemented a synthetic counter consolidating five performance metrics." },
        { companyName: "ADP", jobTitle: "Member Technical", location: "Hyderabad", startDate: "2023-09-01", endDate: "2024-06-01", description: "Developed automation scripts using Selenium, reducing manual effort by 60%. Automated navigation on the sales website built on Oracle CPQ. Trained in Selenium with Java and Spring Boot." },
        { companyName: "Applied Information Sciences", jobTitle: "Intern", location: "Hyderabad", startDate: "2023-03-01", endDate: "2023-05-01", description: "Trained in Java, JDBC and Microsoft Power Platform." },
        { companyName: "Tessell", jobTitle: "Trainee", location: "Remote", startDate: "2022-06-01", endDate: "2022-08-01", description: "Wrote SQL migration scripts." }
      ],
      projects: [
        { title: "Markov Cricket", description: "Modeled cricket innings as a Markov Reward Process.", startDate: "2025-02-01", endDate: "2025-05-01", technologies: ["Python", "PyTorch"] }
      ],
      // Same item present in BOTH arrays — the duplication this task had to remove.
      achievements: [
        { title: "5 star badge in Problem Solving - HackerRank", description: "" },
        { title: "Achieved AIR 2174 out of 123,967 candidates in GATE CS 2024", description: "" }
      ],
      licensesAndCertifications: [
        { title: "5 star badge in Problem Solving - HackerRank", description: "" },
        { title: "Achieved AIR 2174 out of 123,967 candidates in GATE CS 2024", description: "" },
        { title: "Problem Solving through Programming in C - NPTEL", description: "" }
      ],
      customSections: [
        { title: "Extracurricular", entries: [{ title: "NSS", organization: "Volunteer", startDate: "2020-01-01", endDate: "2022-01-01", description: "" }] }
      ]
    }
  },

  {
    name: "sparse-minimal",
    description: "Almost nothing: a name, an email and two skills. Every optional section must vanish cleanly.",
    expect: { minPages: 1, maxPages: 1, hasExperience: false },
    profile: {
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@example.com",
      skills: ["Python", "SQL"],
      skillGroups: [],
      education: [],
      experience: [],
      projects: [],
      achievements: [],
      licensesAndCertifications: []
    }
  },

  {
    name: "latex-hostile-and-dense",
    description: "Non-ASCII name plus every LaTeX special character, 60 skills, and a full data set.",
    expect: { minPages: 1, maxPages: 2, hasExperience: true },
    profile: {
      firstName: "Zoë",
      lastName: "Müller-O'Brien",
      email: "zoe_muller@r&d.example.com",
      phone: "+49 30 12345678",
      linkedinUrl: "https://linkedin.com/in/zoemuller",
      githubUrl: "https://github.com/zoemuller",
      currentGPA: 1.3,
      skills: SIXTY_SKILLS,
      skillGroups: [{ category: "", skills: SIXTY_SKILLS }],
      education: [
        { institution: "Technische Universität München", degree: "M.Sc. Informatik", fieldOfStudy: "Informatik", startDate: "2018-10-01", endDate: "2021-03-01" }
      ],
      experience: [
        {
          companyName: "R&D Labs GmbH (100% remote)",
          jobTitle: "C# / C++ Engineer",
          location: "München, Germany",
          startDate: "2021-04-01",
          isCurrent: true,
          description: "Built a compiler pass in C++ that reduced binary size by 35%. Maintained a C# SDK used by ~40 teams. Wrote LaTeX-generating tooling using \\newcommand and {braces}. Handled 100% of the ^exponent and _subscript edge cases."
        }
      ],
      projects: [
        { title: "TeX_Formatter #1 {beta}", description: "Formatter for LaTeX documents handling & % $ # _ { } ~ ^ and backslashes.", repositoryUrl: "https://github.com/zoemuller/tex-formatter", startDate: "2022-01-01", endDate: "2022-06-01", technologies: ["C++", "C#"] }
      ],
      achievements: [{ title: "100% test coverage award (R&D)", description: "" }],
      licensesAndCertifications: [{ title: "CKA — Certified Kubernetes Administrator", description: "" }],
      customSections: [
        { title: "Relevant Coursework", entries: [{ title: "Compiler Construction" }, { title: "Distributed Systems" }, { title: "Cryptography" }] }
      ]
    }
  }
];

module.exports = { fixtures, TARGET_JOB };
