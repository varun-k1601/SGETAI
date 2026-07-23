import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFormRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

const simpleInitialForm = {
  title: "",
  description: "",
};

const projectInitialForm = {
  title: "",
  description: "",
  startDate: "",
  endDate: "",
  projectUrl: "",
  repositoryUrl: "",
};

function appendIfPresent(formData, key, value) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    formData.append(key, value);
  }
}

function MediaLink({ media, label = "Open file" }) {
  if (!media?.url) {
    return null;
  }

  return (
    <a className="inline-link" href={media.url} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function ListSection({ title, items, emptyText, onDelete, onEdit, editingItemId, renderEditForm, children }) {
  return (
    <article className="info-card">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{emptyText}</p>
        </div>
        <span className="pill">{items.length} saved</span>
      </div>

      {children}

      <div className="portfolio-list">
        {items.map((item) => (
          <article key={item._id} className="portfolio-item">
            {editingItemId === item._id ? (
              renderEditForm(item)
            ) : (
              <>
                <div>
                  <strong>{item.title || "Untitled"}</strong>
                  <p>{item.description || item.paperType || "No description added."}</p>
                  {item.media ? <MediaLink media={item.media} /> : null}
                  {item.mediaFiles?.length ? (
                    <p>{item.mediaFiles.length} media file(s)</p>
                  ) : null}
                  {item.documents?.length ? <p>{item.documents.length} document(s)</p> : null}
                </div>
                <div className="form-inline-action">
                  <button type="button" className="outline-button" onClick={() => onEdit(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => onDelete(item._id)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        {!items.length ? (
          <div className="empty-state-card">
            <h4>No entries yet</h4>
            <p>{emptyText}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ProfilePortfolioManager({ session }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [projectForm, setProjectForm] = useState(projectInitialForm);
  const [certificationForm, setCertificationForm] = useState(simpleInitialForm);
  const [researchForm, setResearchForm] = useState({
    ...simpleInitialForm,
    paperType: "Other",
  });
  const [achievementForm, setAchievementForm] = useState(simpleInitialForm);
  const [projectMediaFiles, setProjectMediaFiles] = useState([]);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [certificationFile, setCertificationFile] = useState(null);
  const [researchFile, setResearchFile] = useState(null);
  const [achievementFile, setAchievementFile] = useState(null);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingSimple, setEditingSimple] = useState({ type: "", id: "" });
  const [projectEditForm, setProjectEditForm] = useState(projectInitialForm);
  const [simpleEditForm, setSimpleEditForm] = useState({ ...simpleInitialForm, paperType: "Other" });
  const [editProjectMediaFiles, setEditProjectMediaFiles] = useState([]);
  const [editProjectDocuments, setEditProjectDocuments] = useState([]);
  const [editSimpleFile, setEditSimpleFile] = useState(null);

  const canManagePortfolio = session?.role === "seeker";

  const profileQuery = useQuery({
    queryKey: ["profile", "me", "media"],
    queryFn: () =>
      apiRequest("/profile/me", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && canManagePortfolio),
  });

  const projectsQuery = useQuery({
    queryKey: ["profile", "projects"],
    queryFn: () =>
      apiRequest("/profile/projects", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && canManagePortfolio),
  });

  const certificationsQuery = useQuery({
    queryKey: ["profile", "certifications"],
    queryFn: () =>
      apiRequest("/profile/certifications", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && canManagePortfolio),
  });

  const researchQuery = useQuery({
    queryKey: ["profile", "research"],
    queryFn: () =>
      apiRequest("/profile/research", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && canManagePortfolio),
  });

  const achievementsQuery = useQuery({
    queryKey: ["profile", "achievements"],
    queryFn: () =>
      apiRequest("/profile/achievements", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && canManagePortfolio),
  });

  const invalidatePortfolio = () => {
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const createProjectMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      Object.entries(projectForm).forEach(([key, value]) => appendIfPresent(formData, key, value));
      projectMediaFiles.forEach((file) => formData.append("mediaFiles", file));
      projectDocuments.forEach((file) => formData.append("documents", file));
      return apiFormRequest("/profile/projects", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Project added." });
      setProjectForm(projectInitialForm);
      setProjectMediaFiles([]);
      setProjectDocuments([]);
      invalidatePortfolio();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const createSimpleMutation = useMutation({
    mutationFn: ({ endpoint, form, file }) => {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => appendIfPresent(formData, key, value));
      if (file) {
        formData.append("file", file);
      }
      return apiFormRequest(endpoint, {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Entry added." });
      setCertificationForm(simpleInitialForm);
      setResearchForm({ ...simpleInitialForm, paperType: "Other" });
      setAchievementForm(simpleInitialForm);
      setCertificationFile(null);
      setResearchFile(null);
      setAchievementFile(null);
      invalidatePortfolio();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const updateProjectMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      Object.entries(projectEditForm).forEach(([key, value]) => appendIfPresent(formData, key, value));
      editProjectMediaFiles.forEach((file) => formData.append("mediaFiles", file));
      editProjectDocuments.forEach((file) => formData.append("documents", file));
      return apiFormRequest(`/profile/projects/${editingProjectId}`, {
        method: "PUT",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Project updated." });
      setEditingProjectId("");
      setProjectEditForm(projectInitialForm);
      setEditProjectMediaFiles([]);
      setEditProjectDocuments([]);
      invalidatePortfolio();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const updateSimpleMutation = useMutation({
    mutationFn: ({ endpoint }) => {
      const formData = new FormData();
      Object.entries(simpleEditForm).forEach(([key, value]) => appendIfPresent(formData, key, value));
      if (editSimpleFile) {
        formData.append("file", editSimpleFile);
      }
      return apiFormRequest(endpoint, {
        method: "PUT",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Entry updated." });
      setEditingSimple({ type: "", id: "" });
      setSimpleEditForm({ ...simpleInitialForm, paperType: "Other" });
      setEditSimpleFile(null);
      invalidatePortfolio();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (endpoint) =>
      apiRequest(endpoint, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Entry deleted." });
      invalidatePortfolio();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  if (!canManagePortfolio) {
    return null;
  }

  const projects = projectsQuery.data?.projects || [];
  const certifications = certificationsQuery.data?.licensesAndCertifications || [];
  const research = researchQuery.data?.researchAndPapers || [];
  const achievements = achievementsQuery.data?.achievements || [];

  function startProjectEdit(item) {
    setEditingSimple({ type: "", id: "" });
    setEditingProjectId(item._id);
    setProjectEditForm({
      title: item.title || "",
      description: item.description || "",
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : "",
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : "",
      projectUrl: item.projectUrl || item.liveUrl || "",
      repositoryUrl: item.repositoryUrl || item.githubUrl || "",
    });
    setEditProjectMediaFiles([]);
    setEditProjectDocuments([]);
  }

  function startSimpleEdit(type, item) {
    setEditingProjectId("");
    setEditingSimple({ type, id: item._id });
    setSimpleEditForm({
      title: item.title || "",
      description: item.description || "",
      paperType: item.paperType || "Other",
    });
    setEditSimpleFile(null);
  }

  function cancelProjectEdit() {
    setEditingProjectId("");
    setProjectEditForm(projectInitialForm);
    setEditProjectMediaFiles([]);
    setEditProjectDocuments([]);
  }

  function cancelSimpleEdit() {
    setEditingSimple({ type: "", id: "" });
    setSimpleEditForm({ ...simpleInitialForm, paperType: "Other" });
    setEditSimpleFile(null);
  }

  function renderProjectEditForm() {
    return (
      <form
        className="portfolio-form portfolio-form--edit"
        onSubmit={(event) => {
          event.preventDefault();
          updateProjectMutation.mutate();
        }}
      >
        <div className="form-grid">
          <label className="form-field">
            <span>Title</span>
            <input type="text" required value={projectEditForm.title} onChange={(event) => setProjectEditForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Project URL</span>
            <input type="url" value={projectEditForm.projectUrl} onChange={(event) => setProjectEditForm((current) => ({ ...current, projectUrl: event.target.value }))} />
          </label>
        </div>
        <label className="form-field">
          <span>Description</span>
          <textarea rows={3} value={projectEditForm.description} onChange={(event) => setProjectEditForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>Repository URL</span>
            <input type="url" value={projectEditForm.repositoryUrl} onChange={(event) => setProjectEditForm((current) => ({ ...current, repositoryUrl: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Replace media files</span>
            <input type="file" multiple accept="image/*,video/*" onChange={(event) => setEditProjectMediaFiles(Array.from(event.target.files || []))} />
          </label>
        </div>
        <label className="form-field">
          <span>Replace documents</span>
          <input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf" onChange={(event) => setEditProjectDocuments(Array.from(event.target.files || []))} />
        </label>
        <div className="form-inline-action">
          <button type="button" className="outline-button" onClick={cancelProjectEdit} disabled={updateProjectMutation.isPending}>
            Cancel
          </button>
          <button type="submit" disabled={updateProjectMutation.isPending}>
            {updateProjectMutation.isPending ? "Saving..." : "Save project"}
          </button>
        </div>
      </form>
    );
  }

  function renderSimpleEditForm(type, endpoint) {
    const isResearch = type === "research";
    return (
      <form
        className="portfolio-form portfolio-form--edit"
        onSubmit={(event) => {
          event.preventDefault();
          updateSimpleMutation.mutate({ endpoint });
        }}
      >
        <div className="form-grid">
          <label className="form-field">
            <span>Title</span>
            <input type="text" required value={simpleEditForm.title} onChange={(event) => setSimpleEditForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          {isResearch ? (
            <label className="form-field">
              <span>Paper type</span>
              <select value={simpleEditForm.paperType} onChange={(event) => setSimpleEditForm((current) => ({ ...current, paperType: event.target.value }))}>
                <option value="Conference">Conference</option>
                <option value="Journal">Journal</option>
                <option value="Whitepaper">Whitepaper</option>
                <option value="Other">Other</option>
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span>Replace attachment</span>
              <input type="file" accept="image/*,.pdf,.doc,.docx,application/pdf" onChange={(event) => setEditSimpleFile(event.target.files?.[0] || null)} />
            </label>
          )}
        </div>
        <label className="form-field">
          <span>Description</span>
          <textarea rows={3} value={simpleEditForm.description} onChange={(event) => setSimpleEditForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        {isResearch ? (
          <label className="form-field">
            <span>Replace attachment</span>
            <input type="file" accept="image/*,.pdf,.doc,.docx,application/pdf" onChange={(event) => setEditSimpleFile(event.target.files?.[0] || null)} />
          </label>
        ) : null}
        <div className="form-inline-action">
          <button type="button" className="outline-button" onClick={cancelSimpleEdit} disabled={updateSimpleMutation.isPending}>
            Cancel
          </button>
          <button type="submit" disabled={updateSimpleMutation.isPending}>
            {updateSimpleMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <section id="profile-media-section" className="dashboard-stack">
      <div className="section-divider">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>Media and portfolio sections</h2>
        </div>
        <span className="pill">Applicant profiles</span>
      </div>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <ListSection
        title="Projects"
        items={projects}
        emptyText="Add portfolio projects with optional media and documents."
        editingItemId={editingProjectId}
        onEdit={startProjectEdit}
        onDelete={(id) => deleteItemMutation.mutate(`/profile/projects/${id}`)}
        renderEditForm={renderProjectEditForm}
      >
        <form
          className="portfolio-form"
          onSubmit={(event) => {
            event.preventDefault();
            createProjectMutation.mutate();
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Title</span>
              <input
                type="text"
                required
                value={projectForm.title}
                onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Project URL</span>
              <input
                type="url"
                value={projectForm.projectUrl}
                onChange={(event) => setProjectForm((current) => ({ ...current, projectUrl: event.target.value }))}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={projectForm.description}
              onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>Repository URL</span>
              <input
                type="url"
                value={projectForm.repositoryUrl}
                onChange={(event) => setProjectForm((current) => ({ ...current, repositoryUrl: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Media files</span>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(event) => setProjectMediaFiles(Array.from(event.target.files || []))}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Documents</span>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf"
              onChange={(event) => setProjectDocuments(Array.from(event.target.files || []))}
            />
          </label>
          <button type="submit" disabled={createProjectMutation.isPending}>
            {createProjectMutation.isPending ? "Adding..." : "Add project"}
          </button>
        </form>
      </ListSection>

      <ListSection
        title="Certifications"
        items={certifications}
        emptyText="Add licenses and certifications with optional attachments."
        editingItemId={editingSimple.type === "certification" ? editingSimple.id : ""}
        onEdit={(item) => startSimpleEdit("certification", item)}
        onDelete={(id) => deleteItemMutation.mutate(`/profile/certifications/${id}`)}
        renderEditForm={(item) => renderSimpleEditForm("certification", `/profile/certifications/${item._id}`)}
      >
        <form
          className="portfolio-form"
          onSubmit={(event) => {
            event.preventDefault();
            createSimpleMutation.mutate({
              endpoint: "/profile/certifications",
              form: certificationForm,
              file: certificationFile,
            });
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Title</span>
              <input
                type="text"
                required
                value={certificationForm.title}
                onChange={(event) => setCertificationForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Attachment</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,application/pdf"
                onChange={(event) => setCertificationFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={certificationForm.description}
              onChange={(event) => setCertificationForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={createSimpleMutation.isPending}>
            Add certification
          </button>
        </form>
      </ListSection>

      <ListSection
        title="Research papers"
        items={research}
        emptyText="Add research papers, conference work, journals, or whitepapers."
        editingItemId={editingSimple.type === "research" ? editingSimple.id : ""}
        onEdit={(item) => startSimpleEdit("research", item)}
        onDelete={(id) => deleteItemMutation.mutate(`/profile/research/${id}`)}
        renderEditForm={(item) => renderSimpleEditForm("research", `/profile/research/${item._id}`)}
      >
        <form
          className="portfolio-form"
          onSubmit={(event) => {
            event.preventDefault();
            createSimpleMutation.mutate({
              endpoint: "/profile/research",
              form: researchForm,
              file: researchFile,
            });
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Title</span>
              <input
                type="text"
                required
                value={researchForm.title}
                onChange={(event) => setResearchForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Paper type</span>
              <select
                value={researchForm.paperType}
                onChange={(event) => setResearchForm((current) => ({ ...current, paperType: event.target.value }))}
              >
                <option value="Conference">Conference</option>
                <option value="Journal">Journal</option>
                <option value="Whitepaper">Whitepaper</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={researchForm.description}
              onChange={(event) => setResearchForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Attachment</span>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,application/pdf"
              onChange={(event) => setResearchFile(event.target.files?.[0] || null)}
            />
          </label>
          <button type="submit" disabled={createSimpleMutation.isPending}>
            Add research
          </button>
        </form>
      </ListSection>

      <ListSection
        title="Achievements"
        items={achievements}
        emptyText="Add awards, recognitions, and profile achievements."
        editingItemId={editingSimple.type === "achievement" ? editingSimple.id : ""}
        onEdit={(item) => startSimpleEdit("achievement", item)}
        onDelete={(id) => deleteItemMutation.mutate(`/profile/achievements/${id}`)}
        renderEditForm={(item) => renderSimpleEditForm("achievement", `/profile/achievements/${item._id}`)}
      >
        <form
          className="portfolio-form"
          onSubmit={(event) => {
            event.preventDefault();
            createSimpleMutation.mutate({
              endpoint: "/profile/achievements",
              form: achievementForm,
              file: achievementFile,
            });
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Title</span>
              <input
                type="text"
                required
                value={achievementForm.title}
                onChange={(event) => setAchievementForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Attachment</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,application/pdf"
                onChange={(event) => setAchievementFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <textarea
              rows={3}
              value={achievementForm.description}
              onChange={(event) => setAchievementForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={createSimpleMutation.isPending}>
            Add achievement
          </button>
        </form>
      </ListSection>
    </section>
  );
}
