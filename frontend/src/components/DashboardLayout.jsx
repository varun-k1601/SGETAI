/**
 * DashboardLayout Component
 * Main layout for Pro user dashboard
 * Combines hero, automation, activity feed, jobs, and career copilot
 */

import { HeroBanner } from "./HeroBanner";
import { AutomationSection } from "./AutomationSection";
import { ActivityFeedCard } from "./ActivityFeedCard";
import { JobRecommendationCard } from "./JobRecommendationCard";

export function DashboardLayout({
  heroData = {},
  automationFeatures = [],
  activities = [],
  jobs = [],
  careerCopilot = null,
  onApplyJob = null,
  onSkipJob = null,
  onToggleFeature = null,
  className = "",
}) {
  return (
    <div className={`${className}`.trim()}>
      {/* Hero Banner */}
      {heroData && (
        <HeroBanner
          status={heroData.status}
          headline={heroData.headline}
          subheadline={heroData.subheadline}
          metrics={heroData.metrics}
        />
      )}

      {/* Automation Section */}
      {automationFeatures && automationFeatures.length > 0 && (
        <AutomationSection
          isActive={automationFeatures.some((f) => f.enabled)}
          features={automationFeatures}
          onToggleFeature={onToggleFeature}
        />
      )}

      {/* Two Column Layout: Activity Feed (2 cols) + Career Copilot (1 col, sticky) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column: Activity Feed (2 columns on desktop) */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-100 rounded-lg p-6">
            {/* Section Header */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                LIVE
              </p>
              <h2 className="text-lg font-semibold text-gray-900">
                AI activity feed
              </h2>
            </div>

            {/* Activity Items - Vertical stack */}
            <div className="space-y-0">
              {activities && activities.length > 0 ? (
                activities.map((activity, idx) => (
                  <ActivityFeedCard key={activity.id || idx} activity={activity} />
                ))
              ) : (
                <p className="text-sm text-gray-600 text-center py-8">
                  No activity yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Career Copilot (1 column, sticky top) */}
        <div className="lg:col-span-1">
          {careerCopilot && (
            <div className="sticky top-6 bg-white border border-gray-100 rounded-lg shadow-sm p-5 space-y-4">
              {/* Header: Icon + Title + Pro Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none">🎯</span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Career Copilot
                  </h3>
                </div>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                  Pro
                </span>
              </div>

              {/* Status - Online indicator */}
              <p className="text-xs text-gray-600">
                Online • Pro automation enabled
              </p>

              {/* Message box */}
              <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md leading-relaxed">
                {careerCopilot.message ||
                  "Morning! Which job are we grabbing today? I can tailor a resume, draft a LinkedIn post, or match you with new openings."}
              </div>

              {/* Quick Action Buttons - 2x2 grid */}
              <div className="grid grid-cols-2 gap-2">
                {careerCopilot.actions &&
                  careerCopilot.actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={action.onClick}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-md transition-colors duration-150"
                    >
                      {action.label}
                    </button>
                  ))}
              </div>

              {/* Input Field + Send */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste a JD, ask for a post..."
                  className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors duration-150 font-semibold">
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-width Job Recommendations Section */}
      {jobs && jobs.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-lg p-6">
          {/* Section Header */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              RANKED BY MATCH
            </p>
            <h2 className="text-lg font-semibold text-gray-900">
              AI-curated for you
            </h2>
          </div>

          {/* Jobs Grid - 3 columns on desktop, 2 on tablet, 1 on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobRecommendationCard
                key={job.id}
                job={job}
                onApply={onApplyJob}
                onSkip={onSkipJob}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
