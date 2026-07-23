import { useMemo } from "react";

export function HomeGreetingBanner({ user }) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "GOOD MORNING";
    if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  }, []);

  const username = user?.profile?.firstName || user?.username || "User";

  return (
    <div className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-6 py-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 w-full">
      {/* Left content */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
          {greeting}
        </span>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          Welcome back, {username}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          42 new jobs match your profile this week. Your network has 12 new updates.
        </p>
      </div>

      {/* Right content - Upgrade button */}
      <button
        onClick={() => window.location.href = "/upgrade"}
        className="flex items-center gap-2 rounded-lg bg-blue-600 text-white font-semibold text-sm px-5 py-2.5 hover:bg-blue-700 active:scale-95 transition-all duration-150 whitespace-nowrap cursor-pointer shrink-0 shadow-sm hover:shadow-md"
      >
        <span>✦</span>
        <span>Upgrade to Pro</span>
      </button>
    </div>
  );
}
