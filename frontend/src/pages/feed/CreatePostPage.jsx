import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { apiFormRequest } from "../../services/api";

const organizationPostTypes = [
  { value: "CompanyUpdate", label: "Company Update" },
  { value: "HiringPost", label: "Hiring Post" },
  { value: "Promotion", label: "Promotion" },
  { value: "Announcement", label: "Announcement" },
];

export function CreatePostPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState("CompanyUpdate");
  const [files, setFiles] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const createPostMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("content", content);

      if (session?.role === "organization") {
        formData.append("postType", postType);
      }

      files.forEach((file) => formData.append("files", file));

      return apiFormRequest("/posts", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Post published." });
      setContent("");
      setPostType("CompanyUpdate");
      setFiles([]);
      setFileInputKey((current) => current + 1);
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  return (
    <section className="dashboard-stack">
      <section className="create-post-layout">
        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Post details</h3>
              <p>Add clear content and optional media before publishing to the feed.</p>
            </div>
            <span className="pill">{session?.role === "organization" ? "Recruiter" : "Applicant"}</span>
          </div>

          <AutoDismissFeedback
            feedback={feedback}
            onClear={() => setFeedback({ type: "", message: "" })}
          />

          <form
            className="auth-form auth-form--wide"
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback({ type: "", message: "" });
              createPostMutation.mutate();
            }}
          >
            <label className="form-field">
              <span>Post content</span>
              <textarea
                rows={7}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  session?.role === "organization"
                    ? "Share a company update, hiring announcement, or promotional post..."
                    : "Share a career update, project milestone, or professional thought..."
                }
                required
              />
            </label>

            {session?.role === "organization" ? (
              <label className="form-field">
                <span>Post category</span>
                <select value={postType} onChange={(event) => setPostType(event.target.value)}>
                  {organizationPostTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="form-field">
              <span>Media attachments</span>
              <input
                key={fileInputKey}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,application/pdf"
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </label>

            {files.length ? (
              <p className="form-inline-note">{files.length} file(s) selected.</p>
            ) : null}

            <div className="button-row">
              <button type="submit" disabled={createPostMutation.isPending || !content.trim()}>
                {createPostMutation.isPending ? "Publishing..." : "Publish post"}
              </button>
              <Link className="outline-button" to="/home">
                View feed
              </Link>
            </div>
          </form>
        </article>
      </section>
    </section>
  );
}
