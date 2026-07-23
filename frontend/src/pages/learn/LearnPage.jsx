import { useState } from "react";

export function LearnPage() {
  const courses = [
    {
      id: 1,
      emoji: "🏗️",
      category: "Engineering",
      title: "System Design for Senior Engineers",
      provider: "AlgoExpert",
      duration: "12h",
      level: "Advanced",
      progress: 62,
      isCompleted: false
    },
    {
      id: 2,
      emoji: "🧬",
      category: "Engineering",
      title: "Advanced TypeScript Patterns",
      provider: "Total TypeScript",
      duration: "8h",
      level: "Advanced",
      progress: 24,
      isCompleted: false
    },
    {
      id: 3,
      emoji: "🎨",
      category: "Design",
      title: "Product Design Fundamentals",
      provider: "Designlab",
      duration: "20h",
      level: "Beginner",
      progress: 0,
      isCompleted: false
    },
    {
      id: 4,
      emoji: "💼",
      category: "Career",
      title: "Negotiating Your Tech Offer",
      provider: "Levels.fyi",
      duration: "3h",
      level: "Intermediate",
      progress: 100,
      isCompleted: true
    },
    {
      id: 5,
      emoji: "🧠",
      category: "AI/ML",
      title: "LLM Engineering with LangChain",
      provider: "DeepLearning.AI",
      duration: "10h",
      level: "Intermediate",
      progress: 38,
      isCompleted: false
    },
    {
      id: 6,
      emoji: "⚡",
      category: "Leadership",
      title: "Leading Without Authority",
      provider: "Reforge",
      duration: "6h",
      level: "Intermediate",
      progress: 0,
      isCompleted: false
    }
  ];

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Skill up
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Learning library
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Curated courses to level up for your next role.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Courses Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <div
            key={course.id}
            className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant"
          >
            {/* Header with emoji and title */}
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface text-2xl">
                {course.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-semibold">
                  {course.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {course.provider} · {course.duration}
                </p>

                {/* Tags */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                    {course.level}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                    {course.category}
                  </span>
                  {course.isCompleted && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium bg-success/15 text-success border-success/30">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide h-3 w-3"
                        aria-hidden="true"
                      >
                        <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"></path>
                        <path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"></path>
                        <path d="M18 9h1.5a1 1 0 0 0 0-5H18"></path>
                        <path d="M4 22h16"></path>
                        <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path>
                        <path d="M6 9H4.5a1 1 0 0 1 0-5H6"></path>
                      </svg>
                      Done
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{course.progress}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-linear-to-r from-purple-500 to-blue-500"
                  style={{ width: `${course.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
