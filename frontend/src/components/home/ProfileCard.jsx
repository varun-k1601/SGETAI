import { useMemo } from "react";

export function ProfileCard({ user }) {
  const initials = useMemo(() => {
    if (!user) return "U";
    const name = user.profile?.firstName || user.username || "User";
    return name.charAt(0).toUpperCase();
  }, [user]);

  const profileStrength = user?.profile?.profileStrength || 72;

  const stats = [
    { label: "Profile views", value: user?.profile?.profileViews || "284", change: "+12%" },
    { label: "Post impressions", value: user?.profile?.postImpressions || "3.2k", change: "+38%" },
    { label: "Search appearances", value: user?.profile?.searchAppearances || "47", change: null },
  ];

  const checklist = [
    "Add 2 more projects",
    "Upload intro video",
    "Add 3 more skills",
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      {/* Blue gradient header banner */}
      <div className="h-20 bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-300"></div>

      {/* Avatar overlapping banner */}
      <div className="relative -mt-8 ml-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-blue-500 border-4 border-white flex items-center justify-center text-white font-bold text-lg shadow-md hover:shadow-lg transition-all duration-200">
          {initials}
        </div>
      </div>

      {/* Name and title section */}
      <div className="px-4 pb-4">
        <p className="text-sm font-semibold text-gray-900">
          {user?.profile?.firstName || user?.username || "User"}
        </p>
        <p className="text-xs text-gray-600">Senior Frontend Engineer</p>
      </div>

      {/* Stats section */}
      <div className="px-4 py-2 space-y-0">
        {stats.map((stat, idx) => (
          <div
            key={stat.label}
            className="flex items-center justify-between py-1.5 px-1 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors duration-150 rounded"
          >
            <span className="text-xs text-gray-600">{stat.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
              {stat.change && (
                <span className="text-xs font-medium text-green-600">{stat.change}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Checklist section */}
      <div className="px-4 py-3 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Profile Checklist</p>
        <div className="space-y-2">
          {checklist.map((item) => (
            <label
              key={item}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-1 rounded transition-colors duration-150"
            >
              <input type="checkbox" className="w-4 h-4 rounded cursor-pointer accent-blue-500" />
              <span className="text-xs text-gray-600">{item}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Profile strength section */}
      <div className="mt-3 pt-3 px-4 pb-4 border-t border-gray-100">
        <p className="text-xs text-gray-600 font-semibold tracking-wider uppercase mb-1">{profileStrength}% Complete</p>
        <p className="text-sm font-semibold text-gray-900 mb-2">Profile strength</p>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${profileStrength}%`,
              background: "linear-gradient(to right, #3b82f6, #06b6d4)",
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}
