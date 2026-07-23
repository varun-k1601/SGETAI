import { useMemo } from "react";
import PropTypes from "prop-types";

/**
 * HomeGreetingBanner Component
 *
 * Displays a personalized greeting banner with time-based salutation,
 * welcome message, and network/job match statistics.
 *
 * Props:
 * - username: string - User's name to display in greeting
 * - jobMatchCount: number - Number of new job matches this week
 * - networkUpdates: number - Number of network updates
 * - isPro: boolean (optional) - If true, hides the "Upgrade to Pro" button
 * - onUpgradeClick: function (optional) - Callback for the upgrade button
 */
export function HomeGreetingBanner({
  username,
  jobMatchCount,
  networkUpdates,
  isPro = false,
  onUpgradeClick,
}) {
  // Memoize time-based greeting so it doesn't recompute on every render
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "GOOD MORNING";
    if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  }, []);

  return (
    <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 via-indigo-50 to-white rounded-2xl px-8 py-6 border border-blue-100 shadow-sm w-full">
      {/* Left side content - stacked vertically */}
      <div className="flex flex-col gap-1">
        {/* Time-based greeting label */}
        <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
          {greeting}
        </p>

        {/* Main heading */}
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">
          Welcome back, {username}
        </h1>

        {/* Subtitle with stats */}
        <p className="text-sm text-gray-400 mt-1">
          {jobMatchCount} new jobs match your profile this week. Your network has{" "}
          {networkUpdates} new updates.
        </p>
      </div>

      {/* Right side CTA button - conditionally rendered if not Pro */}
      {!isPro && (
        <button
          onClick={onUpgradeClick}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 text-white font-semibold text-sm px-5 py-2.5 hover:opacity-90 hover:scale-105 transition-all duration-200 cursor-pointer whitespace-nowrap"
        >
          ✦ Upgrade to Pro
        </button>
      )}
    </div>
  );
}

HomeGreetingBanner.propTypes = {
  username: PropTypes.string.isRequired,
  jobMatchCount: PropTypes.number.isRequired,
  networkUpdates: PropTypes.number.isRequired,
  isPro: PropTypes.bool,
  onUpgradeClick: PropTypes.func,
};
