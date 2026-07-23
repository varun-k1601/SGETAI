export const mockMetrics = {
  autoAppliedThisWeek: 12,
  recruiterResponses: 3,
  scheduledInterviews: 2,
  jobsScanned: 247,
  averageMatchRate: 88,
  averageReplyRate: 4.2,
};

export const mockActivityFeed = [
  {
    id: "1",
    type: "application",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: {
      jobTitle: "Senior React Developer",
      companyName: "TechCorp Inc",
      score: 92,
    },
    status: "success",
  },
  {
    id: "2",
    type: "connection",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    metadata: {
      personName: "Sarah Johnson",
    },
    status: "success",
  },
  {
    id: "3",
    type: "follow_up",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      personName: "Mike Chen",
      jobTitle: "Hiring Manager",
    },
    status: "success",
  },
  {
    id: "4",
    type: "application",
    timestamp: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      jobTitle: "Full Stack Engineer",
      companyName: "StartupXYZ",
      score: 78,
    },
    status: "success",
  },
  {
    id: "5",
    type: "skipped",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      jobTitle: "Junior Developer",
      reason: "Below 75% match threshold",
    },
    status: "pending",
  },
  {
    id: "6",
    type: "profile_update",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      reason: "Resume updated with new projects",
    },
    status: "success",
  },
  {
    id: "7",
    type: "application",
    timestamp: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      jobTitle: "Frontend Architect",
      companyName: "Enterprise Solutions",
      score: 85,
    },
    status: "success",
  },
  {
    id: "8",
    type: "follow_up",
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      personName: "Emily Rodriguez",
      jobTitle: "Recruiter",
    },
    status: "success",
  },
];

export const mockAutomationStatus = {
  features: [
    {
      id: "auto-apply",
      name: "auto-apply",
      enabled: true,
      config: {
        matchThreshold: "75%",
        dailyLimit: 10,
        preferredLocations: "Remote, USA",
      },
    },
    {
      id: "auto-connect",
      name: "auto-connect",
      enabled: true,
      config: {
        targetRole: "Recruiter",
        messageTemplate: "custom",
      },
    },
    {
      id: "auto-dm",
      name: "auto-dm",
      enabled: false,
      config: {},
    },
  ],
};

export const mockJobRecommendations = [
  {
    id: "job-1",
    title: "Senior React Developer",
    company: "TechCorp Inc",
    location: "San Francisco, CA",
    salary: { min: 150000, max: 200000 },
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS"],
    matchPercentage: 92,
    status: "not_applied",
  },
  {
    id: "job-2",
    title: "Full Stack Engineer",
    company: "StartupXYZ",
    location: "Remote",
    salary: { min: 120000, max: 160000 },
    skills: ["JavaScript", "React", "Express.js", "MongoDB", "Docker"],
    matchPercentage: 78,
    status: "applied",
  },
  {
    id: "job-3",
    title: "Frontend Architect",
    company: "Enterprise Solutions",
    location: "New York, NY",
    salary: { min: 180000, max: 220000 },
    skills: ["React", "Vue.js", "System Design", "CSS", "Performance Optimization"],
    matchPercentage: 85,
    status: "not_applied",
  },
  {
    id: "job-4",
    title: "UI/UX Developer",
    company: "DesignHub",
    location: "Remote",
    salary: { min: 100000, max: 140000 },
    skills: ["React", "Figma", "CSS", "JavaScript", "Accessibility"],
    matchPercentage: 72,
    status: "not_applied",
  },
  {
    id: "job-5",
    title: "DevOps Engineer",
    company: "CloudTech",
    location: "Austin, TX",
    salary: { min: 140000, max: 180000 },
    skills: ["Kubernetes", "Docker", "AWS", "Terraform", "CI/CD"],
    matchPercentage: 45,
    status: "not_applied",
  },
  {
    id: "job-6",
    title: "JavaScript Expert",
    company: "WebInnovators",
    location: "Remote",
    salary: { min: 130000, max: 170000 },
    skills: ["JavaScript", "React", "TypeScript", "Testing", "Node.js"],
    matchPercentage: 88,
    status: "not_applied",
  },
];

export const mockSocialFeed = [
  {
    id: "post-1",
    author: {
      name: "John Smith",
      role: "Senior Recruiter",
      initials: "JS"
    },
    content: "We're hiring! Looking for passionate React developers to join our growing team. Competitive salary, great benefits, and flexible work arrangements.",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    hashtags: ["hiring", "react", "developers"],
    engagement: { likes: 24, comments: 5, shares: 3 }
  },
  {
    id: "post-2",
    author: {
      name: "Sarah Chen",
      role: "Tech Lead",
      initials: "SC"
    },
    content: "Just published a comprehensive guide on modern JavaScript patterns. Check it out and let me know your thoughts!",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    hashtags: ["javascript", "programming", "tutorial"],
    engagement: { likes: 156, comments: 23, shares: 45 }
  },
  {
    id: "post-3",
    author: {
      name: "NextGen Tech",
      role: "Company",
      initials: "NT"
    },
    content: "Excited to announce our Series B funding! Thanks to all our team members and supporters. New opportunities opening soon!",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    hashtags: ["startup", "funding", "growth"],
    engagement: { likes: 342, comments: 67, shares: 120 }
  },
  {
    id: "post-4",
    author: {
      name: "Michael Rodriguez",
      role: "Career Coach",
      initials: "MR"
    },
    content: "Pro tip: Your resume should tell a story. Focus on impact and achievements, not just responsibilities.",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    hashtags: ["resume", "careertips", "jobsearch"],
    engagement: { likes: 89, comments: 12, shares: 28 }
  },
  {
    id: "post-5",
    author: {
      name: "Alex Thompson",
      role: "Full Stack Developer",
      initials: "AT"
    },
    content: "Just landed my dream job after 3 months of job searching. Hard work pays off! Thanks to everyone who supported me.",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    hashtags: ["jobsearch", "success", "grateful"],
    engagement: { likes: 201, comments: 34, shares: 56 }
  },
  {
    id: "post-6",
    author: {
      name: "Tech Industry News",
      role: "Company",
      initials: "TN"
    },
    content: "The job market is evolving. Remote work opportunities continue to grow across all industries.",
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    hashtags: ["remotework", "hiring", "trends"],
    engagement: { likes: 523, comments: 98, shares: 234 }
  }
];

export const mockNormalDashboard = {
  profileCompletion: {
    percentage: 72,
    profileViews: 142,
    viewsTrend: 12
  },
  jobMatches: mockJobRecommendations.slice(0, 6),
  activityFeed: mockActivityFeed.slice(0, 8),
  weeklyMetrics: {
    views: 142,
    viewsTrend: 12,
    applications: 5,
    applicationsTrend: 8,
    messages: 3,
    messagesTrend: -2,
    matchPercentage: 78
  },
  socialFeed: mockSocialFeed.slice(0, 6)
};

export const mockProDashboard = {
  profileCompletion: {
    percentage: 72,
    profileViews: 142,
    viewsTrend: 12
  },
  jobMatches: mockJobRecommendations.slice(0, 6),
  activityFeed: mockActivityFeed.slice(0, 8),
  weeklyMetrics: {
    views: 142,
    viewsTrend: 12,
    applications: 12,
    applicationsTrend: 25,
    messages: 8,
    messagesTrend: 15,
    matchPercentage: 88
  },
  socialFeed: mockSocialFeed.slice(0, 6),
  automationStatus: mockAutomationStatus,
  advancedMetrics: {
    recruiterResponseRate: 42,
    averageResponseTime: "2-3 days",
    scheduledInterviews: 4,
    offersReceived: 2,
    acceptedOffers: 1
  }
};

export const mockRecruiterDashboard = {
  postedJobs: [
    {
      id: "rec-job-1",
      title: "Senior React Developer",
      company: "Your Company",
      status: "active",
      applicantCount: 24,
      viewCount: 312,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "rec-job-2",
      title: "Full Stack Engineer",
      company: "Your Company",
      status: "active",
      applicantCount: 18,
      viewCount: 245,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "rec-job-3",
      title: "DevOps Engineer",
      company: "Your Company",
      status: "active",
      applicantCount: 12,
      viewCount: 156,
      createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "rec-job-4",
      title: "UI/UX Designer",
      company: "Your Company",
      status: "closed",
      applicantCount: 31,
      viewCount: 489,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  applicantPipeline: {
    totalApplications: 85,
    inReview: 24,
    interviewed: 8,
    offerSent: 3,
    rejected: 42,
    accepted: 8
  },
  recentApplicants: [
    {
      id: "cand-1",
      name: "Alice Johnson",
      appliedFor: "Senior React Developer",
      appliedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: "new",
      matchScore: 92,
      resumeUrl: "https://example.com/resume1.pdf"
    },
    {
      id: "cand-2",
      name: "Bob Williams",
      appliedFor: "Full Stack Engineer",
      appliedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: "reviewing",
      matchScore: 78,
      resumeUrl: "https://example.com/resume2.pdf"
    },
    {
      id: "cand-3",
      name: "Carol Martinez",
      appliedFor: "Senior React Developer",
      appliedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: "interviewed",
      matchScore: 85,
      resumeUrl: "https://example.com/resume3.pdf"
    },
    {
      id: "cand-4",
      name: "David Lee",
      appliedFor: "Full Stack Engineer",
      appliedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
      status: "offered",
      matchScore: 88,
      resumeUrl: "https://example.com/resume4.pdf"
    },
    {
      id: "cand-5",
      name: "Emma Wilson",
      appliedFor: "Senior React Developer",
      appliedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "accepted",
      matchScore: 95,
      resumeUrl: "https://example.com/resume5.pdf"
    }
  ],
  analytics: {
    totalJobViews: 1202,
    totalApplications: 85,
    applicationRate: 7,
    averageMatchQuality: 76,
    hireRate: 9
  }
};
