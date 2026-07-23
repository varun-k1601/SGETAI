import { useNavigate } from "react-router-dom";

export function ActivitySidebar() {
  const navigate = useNavigate();

  const activityMetrics = [
    { label: "Views", value: "284", stat: "+12%", statColor: "text-green-600" },
    { label: "Apps", value: "9", stat: "3 active", statColor: "text-gray-600" },
    { label: "DMs", value: "4", stat: "2 new", statColor: "text-blue-600" },
    { label: "Match", value: "87%", stat: "↑4", statColor: "text-green-600" },
  ];

  const topMatches = [
    { id: 1, title: "Senior React Developer", company: "Stripe", location: "Remote", match: 94 },
    { id: 2, title: "Frontend Engineer", company: "Vercel", location: "SF Bay", match: 88 },
    { id: 3, title: "Full Stack Engineer", company: "Linear", location: "Remote", match: 85 },
  ];

  return (
    <div className="space-y-4">
      {/* Activity Card */}
      <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-5">
        <p className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-1">Activity</p>
        <p className="text-lg font-semibold text-gray-900 mb-4">This week</p>

        <div className="grid grid-cols-2 gap-4">
          {activityMetrics.map(({ label, value, stat, statColor }) => (
            <div key={label}>
              <p className="text-xs text-gray-600 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className={`text-xs font-medium ${statColor}`}>{stat}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Matches Card */}
      <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-5">
        <p className="text-xs font-semibold tracking-widest text-gray-600 uppercase mb-3">For You</p>
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-semibold text-gray-900">Top matches</p>
          <button
            onClick={() => navigate("/jobs")}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            See all →
          </button>
        </div>

        <div className="space-y-2">
          {topMatches.map((job) => (
            <div
              key={job.id}
              onClick={() => navigate(`/jobs/${job.id}`)}
              className="p-3 rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-all duration-200 cursor-pointer border border-transparent group"
            >
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors duration-150">{job.title}</p>
                <span className="text-xs font-bold text-green-600">{job.match}%</span>
              </div>
              <p className="text-xs text-gray-600 group-hover:text-gray-700 transition-colors duration-150">{job.company} · {job.location}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
