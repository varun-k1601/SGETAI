import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMediaUrl } from "./CompanyLogo";

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75-3.54L6 15h12l-3.04-4.71z" fill="currentColor" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 4l2 4h-3l2-4M4 6h16v12H4zm0-3h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2z" fill="currentColor" />
    </svg>
  );
}

function ArticleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5h5v2h-5v-2zm0-3h5v2h-5v-2zM7 8.5h2v2H7v-2zm0 4h2v2H7v-2zm10 8H7v2h10v-2z" fill="currentColor" />
    </svg>
  );
}

function getProfileInitial(session) {
  const profile = session?.profile || {};
  const name =
    session?.role === "organization"
      ? profile.companyName
      : `${profile.firstName || ""} ${profile.lastName || ""}`.trim();

  return (name || session?.email || "M").trim()[0]?.toUpperCase() || "M";
}

export function PostCreationWidget() {
  const { session } = useAuth();
  const navigate = useNavigate();

  function handleTextClick() {
    navigate("/posts/create");
  }

  function handlePhotoClick() {
    navigate("/posts/create?type=photo");
  }

  function handleVideoClick() {
    navigate("/posts/create?type=video");
  }

  function handleArticleClick() {
    navigate("/posts/create");
  }

  return (
    <section className="post-creation-widget">
      <div className="post-creation-container">
        <div className="post-creation-avatar">
          {getMediaUrl(session?.profile?.profilePicture) || getMediaUrl(session?.profile?.logo) ? (
            <img src={getMediaUrl(session?.profile?.profilePicture) || getMediaUrl(session?.profile?.logo)} alt="Your avatar" />
          ) : (
            <span>{getProfileInitial(session)}</span>
          )}
        </div>

        <div className="post-creation-content">
          <div className="post-creation-input" onClick={handleTextClick}>
            <input
              type="text"
              placeholder="Start a post"
              readOnly
            />
          </div>

          <div className="post-creation-actions">
            <button
              type="button"
              className="post-action-button photo-action"
              onClick={handlePhotoClick}
            >
              <PhotoIcon />
              <span>Photo</span>
            </button>

            <button
              type="button"
              className="post-action-button video-action"
              onClick={handleVideoClick}
            >
              <VideoIcon />
              <span>Video</span>
            </button>

            <button
              type="button"
              className="post-action-button article-action"
              onClick={handleArticleClick}
            >
              <ArticleIcon />
              <span>Write article</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
