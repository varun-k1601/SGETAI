import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export function CreatePostCard({ user }) {
  const navigate = useNavigate();

  const initials = useMemo(() => {
    if (!user) return "U";
    const name = user.profile?.firstName || user.username || "User";
    return name.charAt(0).toUpperCase();
  }, [user]);

  const actions = [
    { icon: "🖼", label: "Photo" },
    { icon: "🎥", label: "Video" },
    { icon: "📅", label: "Event" },
    { icon: "💼", label: "Post job" },
  ];

  const handleInputClick = () => {
    navigate("/posts/create");
  };

  const handleActionClick = () => {
    navigate("/posts/create");
  };

  return (
    <div className="create-post-card">
      {/* Top row: avatar + input trigger */}
      <div className="create-post-top">
        <div className="create-post-avatar">{initials}</div>
        <button type="button" className="create-post-trigger" onClick={handleInputClick}>
          Share an update, a job opening, or a win...
        </button>
      </div>

      {/* Bottom row: action buttons */}
      <div className="create-post-actions">
        {actions.map(({ icon, label }) => (
          <button
            key={label}
            type="button"
            className="create-post-action"
            onClick={handleActionClick}
          >
            <span className="create-post-action__icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
