import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiFormRequest, apiRequest } from "../../services/api";
import { ProfilePortfolioManager } from "./ProfilePortfolioManager";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { categorizeSkills, skillsFromCsv } from "../../utils/skillCategorizer";
import { CompanyLogo, getMediaUrl } from "../../components/CompanyLogo";

const seekerInitialForm = {
  firstName: "",
  lastName: "",
  username: "",
  phone: "",
  tagline: "",
  bio: "",
  careerObjective: "",
  currentStatus: "Student",
  universityName: "",
  degree: "",
  major: "",
  graduationYear: "",
  currentGPA: "",
  education: [],
  skills: "",
  skillGroups: [],
  preferredRoles: "",
  portfolioUrl: "",
  linkedinUrl: "",
  githubUrl: "",
  openToWork: false,
  expectedSalary: "",
  experience: [],
  customSections: [],
};

const organizationInitialForm = {
  companyName: "",
  username: "",
  phone: "",
  industry: "",
  companySize: "",
  websiteUrl: "",
  linkedinPage: "",
  description: "",
  headquartersLocation: "",
  foundedYear: "",
};

function StatCard({ label, value, hint }) {
  return (
    <article className="stat-surface">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function toCsv(values) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function fromCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptySkillGroup() {
  return {
    category: "",
    skills: "",
  };
}

function normalizeSkillGroups(profile = {}) {
  if (Array.isArray(profile.skillGroups) && profile.skillGroups.length) {
    return profile.skillGroups.map((group) => ({
      _id: group._id,
      category: toInputValue(group.category),
      skills: toCsv(group.skills),
    }));
  }

  return categorizeSkills(profile.skills || []).map((group) => ({
    category: group.label,
    skills: toCsv(group.skills),
  }));
}

function flattenSkillGroupsForPayload(groups = []) {
  return [...new Set(
    groups
      .flatMap((group) => fromCsv(group.skills))
      .map((skill) => skill.trim())
      .filter(Boolean)
  )];
}

function cleanSkillGroupsForPayload(groups = []) {
  return groups
    .map((group) => ({
      ...(group._id ? { _id: group._id } : {}),
      category: group.category.trim(),
      skills: fromCsv(group.skills),
    }))
    .filter((group) => group.category || group.skills.length);
}

function toInputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function toDateInputValue(value) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 10);
}

function normalizeExperienceItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    _id: item._id,
    jobTitle: toInputValue(item.jobTitle),
    companyName: toInputValue(item.companyName),
    startDate: toDateInputValue(item.startDate),
    endDate: toDateInputValue(item.endDate),
    isCurrent: Boolean(item.isCurrent),
    description: toInputValue(item.description),
    managerEmail: toInputValue(item.managerEmail),
  }));
}

function normalizeEducationItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    _id: item._id,
    institution: toInputValue(item.institution),
    degree: toInputValue(item.degree),
    fieldOfStudy: toInputValue(item.fieldOfStudy),
    startDate: toDateInputValue(item.startDate),
    endDate: toDateInputValue(item.endDate),
  }));
}

function createEmptyEducation() {
  return {
    institution: "",
    degree: "",
    fieldOfStudy: "",
    startDate: "",
    endDate: "",
  };
}

function createEmptyExperience() {
  return {
    jobTitle: "",
    companyName: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    managerEmail: "",
  };
}

// A custom-section entry can be a bare list item (e.g. a course name — only "title" filled)
// or a dated role/activity entry (title + organization + dates + description).
function createEmptyCustomSectionEntry() {
  return {
    title: "",
    organization: "",
    startDate: "",
    endDate: "",
    description: "",
  };
}

function createEmptyCustomSection() {
  return {
    title: "",
    entries: [createEmptyCustomSectionEntry()],
  };
}

function normalizeCustomSectionItems(sections = []) {
  return (Array.isArray(sections) ? sections : []).map((section) => ({
    _id: section._id,
    title: toInputValue(section.title),
    entries: (Array.isArray(section.entries) ? section.entries : []).map((entry) => ({
      _id: entry._id,
      title: toInputValue(entry.title),
      organization: toInputValue(entry.organization),
      startDate: toDateInputValue(entry.startDate),
      endDate: toDateInputValue(entry.endDate),
      description: toInputValue(entry.description),
    })),
  }));
}

const seekerSections = [
  {
    id: "basic",
    title: "Basic details",
    description: "Name, username, phone, tagline, and work availability.",
    fields: ["firstName", "lastName", "username", "phone", "tagline", "currentStatus", "expectedSalary", "openToWork"],
  },
  {
    id: "education",
    title: "Education",
    description: "College, degree, major, dates, and GPA used in every generated resume and education-year matching.",
    fields: ["universityName", "degree", "major", "graduationYear", "currentGPA", "education"],
  },
  {
    id: "career",
    title: "Career summary",
    description: "Bio and objective used for recommendations, ATS matching, and resume objective.",
    fields: ["bio", "careerObjective"],
  },
  {
    id: "experience",
    title: "Experience",
    description: "Add work or internship history. Manager email is optional and only needed for background verification.",
    fields: ["experience"],
  },
  {
    id: "skills",
    title: "Skills and preferences",
    description: "Skills, preferred roles, salary, and open-to-work signals.",
    fields: ["skillGroups", "preferredRoles"],
  },
  {
    id: "links",
    title: "Portfolio links",
    description: "Portfolio, LinkedIn, and GitHub links shown in your resume header.",
    fields: ["portfolioUrl", "linkedinUrl", "githubUrl"],
  },
  {
    id: "customSections",
    title: "Additional sections",
    description: "Sections from your résumé that don't fit a standard category — coursework, extracurriculars, publications, and similar.",
    fields: ["customSections"],
  },
];

const organizationSections = [
  {
    id: "company",
    title: "Company details",
    description: "Main company profile information shown to applicants.",
    fields: ["companyName", "username", "phone", "industry", "companySize"],
  },
  {
    id: "presence",
    title: "Online presence",
    description: "Website, LinkedIn page, and public company description.",
    fields: ["websiteUrl", "linkedinPage", "description"],
  },
  {
    id: "location",
    title: "Location and founding",
    description: "Headquarters and founding year details.",
    fields: ["headquartersLocation", "foundedYear"],
  },
];

function ProfileEditSection({
  section,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSubmit,
  children,
}) {
  return (
    <form className="info-card profile-edit-section" onSubmit={onSubmit}>
      <div className="section-head">
        <div>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <div className="form-inline-action">
          {isEditing ? (
            <>
              <button type="button" className="outline-button" onClick={onCancel} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <button type="button" className="outline-button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
      {children}
    </form>
  );
}

function ApplicantProfileCover({
  profile,
  connectionCount,
  profilePictureUrl,
  backgroundVideoUrl,
  onEditProfile,
  onOpenProfilePictureManager,
  onOpenBackgroundVideoManager,
  isUploadingBackground,
}) {
  const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Applicant";
  const initials = fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";
  const headline = profile.tagline || [profile.currentStatus, profile.universityName ? `at ${profile.universityName}` : ""]
    .filter(Boolean)
    .join(" ") || "Complete your headline";
  const institutionName = profile.universityName || profile.education?.[profile.education.length - 1]?.institution || "Education not added";

  return (
    <article className="profile-cover-card">
      <button
        type="button"
        className="profile-cover-card__media"
        onClick={onOpenBackgroundVideoManager}
        aria-label="Manage background video"
      >
        {backgroundVideoUrl ? (
          <video src={backgroundVideoUrl} autoPlay muted loop playsInline />
        ) : (
          <div className="profile-cover-card__pattern" aria-hidden="true" />
        )}
        <span className="profile-cover-card__camera">
          {isUploadingBackground ? "Uploading..." : "Camera"}
        </span>
      </button>

      <div className="profile-cover-card__body">
        <button
          type="button"
          className="profile-cover-card__avatar"
          onClick={onOpenProfilePictureManager}
          aria-label="Manage profile photo"
        >
          {profilePictureUrl ? (
            <img src={profilePictureUrl} alt={fullName} />
          ) : (
            <span>{initials}</span>
          )}
        </button>

        <button type="button" className="profile-cover-card__edit" onClick={onEditProfile}>
          Edit
        </button>

        <div className="profile-cover-card__content">
          <div className="profile-cover-card__main">
            <h1>{fullName}</h1>
            <p>{headline}</p>
            <span>
              @{profile.username || "username"} {profile.openToWork ? "- Open to work" : ""}
            </span>
            <strong>{connectionCount} connection{connectionCount === 1 ? "" : "s"}</strong>
          </div>

          <div className="profile-cover-card__institution">
            <div className="profile-cover-card__institution-logo">
              {institutionName[0] || "E"}
            </div>
            <p>{institutionName}</p>
          </div>
        </div>

        <div className="profile-cover-card__actions">
          <button type="button" onClick={onEditProfile}>
            Edit profile
          </button>
          <Link className="outline-button" to="/posts/create">
            Create post
          </Link>
        </div>
      </div>
    </article>
  );
}

function ProfileMediaManagerModal({
  type,
  title,
  mediaUrl,
  hasMedia,
  feedback,
  isUploading,
  isRemoving,
  onClose,
  onClearFeedback,
  onFileSelect,
  onRemove,
}) {
  const isVideo = type === "video";
  const fileInputRef = useRef(null);

  function handleEditClick() {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        className="profile-media-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-media-modal__header">
          <h3>{title}</h3>
          <button type="button" className="profile-media-modal__close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className={`profile-media-modal__preview ${isVideo ? "profile-media-modal__preview--video" : ""}`}>
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} controls />
            ) : (
              <img src={mediaUrl} alt={title} />
            )
          ) : (
            <div className="profile-media-modal__empty">
              <span>{isVideo ? "No background video uploaded yet." : "No profile photo uploaded yet."}</span>
            </div>
          )}
        </div>

        <div className="profile-media-modal__feedback">
          <AutoDismissFeedback feedback={feedback} onClear={onClearFeedback} />
        </div>

        <div className="profile-media-modal__toolbar">
          <span className="profile-media-modal__visibility">Anyone</span>
          <div className="profile-media-modal__actions">
            <input
              ref={fileInputRef}
              className="resume-file-input"
              type="file"
              accept={isVideo ? "video/*" : "image/*"}
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFileSelect(file);
                }
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="profile-media-modal__action"
              onClick={handleEditClick}
              disabled={isUploading}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M4 16.8V20h3.2L17.9 9.3l-3.2-3.2L4 16.8Zm16.3-10.6c.4-.4.4-1 0-1.4l-1.1-1.1c-.4-.4-1-.4-1.4 0l-1.4 1.4 3.2 3.2 1.7-2.1Z" />
              </svg>
              {isUploading ? "Uploading..." : "Edit"}
            </button>
            <button
              type="button"
              className="profile-media-modal__action profile-media-modal__action--danger"
              onClick={onRemove}
              disabled={!hasMedia || isRemoving}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M7 21c-1.1 0-2-.9-2-2V8h14v11c0 1.1-.9 2-2 2H7ZM9 6V4h6v2h5v2H4V6h5Zm1 5v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
              </svg>
              {isRemoving ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

export function ProfilePage() {
  const { session, replaceProfile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [editingSection, setEditingSection] = useState("");
  const [autofillReview, setAutofillReview] = useState(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState("");
  const [mediaModal, setMediaModal] = useState("");
  const [localProfilePicturePreviewUrl, setLocalProfilePicturePreviewUrl] = useState("");
  const [localBackgroundVideoPreviewUrl, setLocalBackgroundVideoPreviewUrl] = useState("");
  const showOAuthWelcome = searchParams.get("welcome") === "oauth" && session?.role === "seeker";

  const profileQuery = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () =>
      apiRequest("/profile/me", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const profile = profileQuery.data?.profile || session?.profile || {};

  useEffect(() => {
    if (localProfilePicturePreviewUrl) {
      return undefined;
    }

    if (!profile.profilePicture?.filePath || !session?.accessToken || session?.role !== "seeker") {
      setProfilePictureUrl("");
      return undefined;
    }

    let didCancel = false;
    let objectUrl = "";

    apiBlobRequest(`/profile/media/profile-picture?v=${encodeURIComponent(profile.profilePicture.filePath)}`, {
      token: session.accessToken,
    })
      .then(({ blob }) => {
        if (didCancel) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setProfilePictureUrl(objectUrl);
      })
      .catch(() => {
        if (!didCancel) {
          setProfilePictureUrl("");
        }
      });

    return () => {
      didCancel = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [localProfilePicturePreviewUrl, profile.profilePicture?.filePath, session?.accessToken, session?.role]);

  useEffect(() => {
    if (localBackgroundVideoPreviewUrl) {
      return undefined;
    }

    if (!profile.backgroundVideo?.filePath || !session?.accessToken || session?.role !== "seeker") {
      setBackgroundVideoUrl("");
      return undefined;
    }

    let didCancel = false;
    let objectUrl = "";

    apiBlobRequest(`/profile/media/background-video?v=${encodeURIComponent(profile.backgroundVideo.filePath)}`, {
      token: session.accessToken,
    })
      .then(({ blob }) => {
        if (didCancel) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setBackgroundVideoUrl(objectUrl);
      })
      .catch(() => {
        if (!didCancel) {
          setBackgroundVideoUrl("");
        }
      });

    return () => {
      didCancel = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [localBackgroundVideoPreviewUrl, profile.backgroundVideo?.filePath, session?.accessToken, session?.role]);

  useEffect(() => {
    return () => {
      if (localProfilePicturePreviewUrl) {
        URL.revokeObjectURL(localProfilePicturePreviewUrl);
      }
    };
  }, [localProfilePicturePreviewUrl]);

  useEffect(() => {
    return () => {
      if (localBackgroundVideoPreviewUrl) {
        URL.revokeObjectURL(localBackgroundVideoPreviewUrl);
      }
    };
  }, [localBackgroundVideoPreviewUrl]);

  const acceptedConnectionsQuery = useQuery({
    queryKey: ["connections", "accepted", "profile-count"],
    queryFn: () =>
      apiRequest("/connections", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const acceptedConnectionsCount = acceptedConnectionsQuery.data?.connections?.length || 0;

  const initialForm = useMemo(() => {
    if (session?.role === "organization") {
      return organizationInitialForm;
    }

    return seekerInitialForm;
  }, [session?.role]);

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (session?.role === "organization") {
      setForm({
        companyName: toInputValue(profile.companyName),
        username: toInputValue(profile.username),
        phone: toInputValue(profile.phone),
        industry: toInputValue(profile.industry),
        companySize: toInputValue(profile.companySize),
        websiteUrl: toInputValue(profile.websiteUrl),
        linkedinPage: toInputValue(profile.linkedinPage),
        description: toInputValue(profile.description),
        headquartersLocation: toInputValue(profile.headquartersLocation),
        foundedYear: toInputValue(profile.foundedYear),
      });
      return;
    }

    setForm({
      firstName: toInputValue(profile.firstName),
      lastName: toInputValue(profile.lastName),
      username: toInputValue(profile.username),
      phone: toInputValue(profile.phone),
      tagline: toInputValue(profile.tagline),
      bio: toInputValue(profile.bio),
      careerObjective: toInputValue(profile.careerObjective),
      currentStatus: toInputValue(profile.currentStatus || "Student"),
      universityName: toInputValue(profile.universityName),
      degree: toInputValue(profile.degree),
      major: toInputValue(profile.major),
      graduationYear: toInputValue(profile.graduationYear),
      currentGPA: toInputValue(profile.currentGPA),
      education: normalizeEducationItems(profile.education),
      skills: toCsv(profile.skills),
      skillGroups: normalizeSkillGroups(profile),
      preferredRoles: toCsv(profile.preferredRoles),
      portfolioUrl: toInputValue(profile.portfolioUrl),
      linkedinUrl: toInputValue(profile.linkedinUrl),
      githubUrl: toInputValue(profile.githubUrl),
      openToWork: Boolean(profile.openToWork),
      expectedSalary: toInputValue(profile.expectedSalary),
      experience: normalizeExperienceItems(profile.experience),
    });
  }, [profile, session?.role]);

  const updateMutation = useMutation({
    mutationFn: async (body) => {
      return apiRequest("/profile/me", {
        method: "PUT",
        token: session.accessToken,
        body,
      });
    },
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
      setEditingSection("");
      setFeedback({
        type: "success",
        message: response.message || "Profile updated successfully.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const logoMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      return apiFormRequest("/profile/picture", {
        method: "PUT",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setFeedback({
        type: "success",
        message: response.message || "Company logo updated successfully.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: () =>
      apiRequest("/profile/picture", {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setFeedback({
        type: "success",
        message: response.message || "Company logo removed successfully.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const profileCoverPictureMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      return apiFormRequest("/profile/picture", {
        method: "PUT",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setProfilePictureUrl(response.profile?.profilePicture?.url || "");
      setLocalProfilePicturePreviewUrl("");
      setMediaModal("");
      setFeedback({
        type: "success",
        message: response.message || "Profile picture updated successfully.",
      });
    },
    onError: (error) => {
      setLocalProfilePicturePreviewUrl("");
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setFeedback({ type: "error", message: error.message });
    },
  });

  const backgroundCoverMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      return apiFormRequest("/profile/background-video", {
        method: "PUT",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setBackgroundVideoUrl(response.profile?.backgroundVideo?.url || "");
      setLocalBackgroundVideoPreviewUrl("");
      setMediaModal("");
      setFeedback({
        type: "success",
        message: response.message || "Background video updated successfully.",
      });
    },
    onError: (error) => {
      setLocalBackgroundVideoPreviewUrl("");
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setFeedback({ type: "error", message: error.message });
    },
  });

  const removeCoverMediaMutation = useMutation({
    mutationFn: (endpoint) =>
      apiRequest(endpoint, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response, endpoint) => {
      replaceProfile(response.profile);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      setMediaModal("");
      setFeedback({
        type: "success",
        message:
          response.message ||
          (endpoint === "/profile/background-video"
            ? "Background video removed successfully."
            : "Profile picture removed successfully."),
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleProfilePictureFileSelect(file) {
    const previewUrl = URL.createObjectURL(file);
    setLocalProfilePicturePreviewUrl(previewUrl);
    setProfilePictureUrl(previewUrl);
    profileCoverPictureMutation.mutate(file);
  }

  function handleBackgroundVideoFileSelect(file) {
    const previewUrl = URL.createObjectURL(file);
    setLocalBackgroundVideoPreviewUrl(previewUrl);
    setBackgroundVideoUrl(previewUrl);
    backgroundCoverMutation.mutate(file);
  }

  function handleChange(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // Merge a parsed-resume draft into the form. Only non-empty draft values overwrite
  // existing fields, so we never wipe data the user already entered.
  function mergeResumeDraftIntoForm(current, draft) {
    const next = { ...current };
    const setIf = (field, value) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        next[field] = toInputValue(value);
      }
    };

    setIf("firstName", draft.firstName);
    setIf("lastName", draft.lastName);
    setIf("phone", draft.phone);
    setIf("careerObjective", draft.careerObjective);
    setIf("currentStatus", draft.currentStatus);
    setIf("universityName", draft.universityName);
    setIf("degree", draft.degree);
    setIf("major", draft.major);
    setIf("graduationYear", draft.graduationYear);
    setIf("currentGPA", draft.currentGPA);
    setIf("linkedinUrl", draft.linkedinUrl);
    setIf("githubUrl", draft.githubUrl);
    setIf("portfolioUrl", draft.portfolioUrl);

    if (Array.isArray(draft.skills) && draft.skills.length) {
      next.skills = toCsv(draft.skills);
    }
    if (Array.isArray(draft.preferredRoles) && draft.preferredRoles.length) {
      next.preferredRoles = toCsv(draft.preferredRoles);
    }
    if (Array.isArray(draft.skillGroups) && draft.skillGroups.length) {
      next.skillGroups = draft.skillGroups.map((group) => ({
        category: toInputValue(group.category),
        skills: toCsv(group.skills),
      }));
    }
    if (Array.isArray(draft.education) && draft.education.length) {
      next.education = normalizeEducationItems(draft.education);
    }
    if (Array.isArray(draft.experience) && draft.experience.length) {
      next.experience = normalizeExperienceItems(draft.experience);
    }
    if (Array.isArray(draft.additionalSections) && draft.additionalSections.length) {
      next.customSections = normalizeCustomSectionItems(draft.additionalSections);
    }

    return next;
  }

  const resumeAutofillMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      return apiFormRequest("/profile/parse-resume", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      const draft = response.draft || {};
      setForm((current) => mergeResumeDraftIntoForm(current, draft));
      setAutofillReview({
        draft,
        warnings: response.warnings || [],
        usedFallback: Boolean(response.usedFallback),
        projectsCount: (draft.projects || []).length,
        certificationsCount: (draft.certifications || []).length,
        achievementsCount: (draft.achievements || []).length,
        additionalSectionsCount: (draft.additionalSections || []).length,
      });
      setEditingSection("");
      setFeedback({
        type: response.usedFallback ? "error" : "success",
        message:
          response.message ||
          "Résumé imported. Review the details, then click Save all imported details.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleResumeAutofill(file) {
    if (!file) {
      return;
    }
    setAutofillReview(null);
    setFeedback({
      type: "info",
      message: "Reading your résumé… this can take up to a minute.",
    });
    resumeAutofillMutation.mutate(file);
  }

  const applyResumeMutation = useMutation({
    mutationFn: async (body) =>
      apiRequest("/profile/apply-parsed-resume", {
        method: "PUT",
        token: session.accessToken,
        body,
      }),
    onSuccess: (response) => {
      replaceProfile(response.profile);
      queryClient.setQueryData(["profile", "me"], (current) => ({
        ...(current || {}),
        profile: response.profile,
      }));
      // Projects / certifications / achievements are loaded by separate queries; refresh them.
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setAutofillReview(null);
      setEditingSection("");
      setFeedback({
        type: "success",
        message: response.message || "Imported résumé details saved to your profile.",
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleSaveAllImported() {
    if (!autofillReview) {
      return;
    }

    // Main-form fields (respecting any edits the user made in the pre-filled form).
    const mainFields = [...new Set(seekerSections.flatMap((section) => section.fields))].filter(
      (field) => field !== "username"
    );
    const body = buildPayload(mainFields);

    // Drop empty values so we never overwrite existing data with blanks.
    Object.keys(body).forEach((key) => {
      const value = body[key];
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete body[key];
      }
    });

    // Sections not represented in the main form come straight from the parsed draft.
    const draft = autofillReview.draft || {};
    if (Array.isArray(draft.projects) && draft.projects.length) body.projects = draft.projects;
    if (Array.isArray(draft.certifications) && draft.certifications.length) {
      body.certifications = draft.certifications;
    }
    if (Array.isArray(draft.achievements) && draft.achievements.length) {
      body.achievements = draft.achievements;
    }

    applyResumeMutation.mutate(body);
  }

  function resetFields(fields) {
    setForm((current) => {
      const next = { ...current };

      fields.forEach((field) => {
        if (session?.role === "organization") {
          next[field] = toInputValue(profile[field]);
          return;
        }

        if (field === "skills" || field === "preferredRoles") {
          next[field] = toCsv(profile[field]);
          return;
        }

        if (field === "skillGroups") {
          next[field] = normalizeSkillGroups(profile);
          return;
        }

        if (field === "openToWork") {
          next[field] = Boolean(profile.openToWork);
          return;
        }

        if (field === "experience") {
          next[field] = normalizeExperienceItems(profile.experience);
          return;
        }

        if (field === "education") {
          next[field] = normalizeEducationItems(profile.education);
          return;
        }

        if (field === "customSections") {
          next[field] = normalizeCustomSectionItems(profile.customSections);
          return;
        }

        next[field] = toInputValue(profile[field]);
      });

      return next;
    });
  }

  function buildPayload(fields) {
    return fields.reduce((body, field) => {
      if (field === "skills" || field === "preferredRoles") {
        body[field] = fromCsv(form[field]);
        return body;
      }

      if (field === "skillGroups") {
        body.skillGroups = cleanSkillGroupsForPayload(form.skillGroups);
        body.skills = flattenSkillGroupsForPayload(form.skillGroups);
        return body;
      }

      if (["graduationYear", "currentGPA", "expectedSalary", "foundedYear"].includes(field)) {
        body[field] = form[field] ? Number(form[field]) : undefined;
        return body;
      }

      if (field === "openToWork") {
        body[field] = Boolean(form[field]);
        return body;
      }

      if (field === "experience") {
        body[field] = (form.experience || [])
          .map((item) => ({
            ...(item._id ? { _id: item._id } : {}),
            jobTitle: item.jobTitle,
            companyName: item.companyName,
            startDate: item.startDate || undefined,
            endDate: item.isCurrent ? undefined : item.endDate || undefined,
            isCurrent: Boolean(item.isCurrent),
            description: item.description,
            managerEmail: item.managerEmail,
          }))
          .filter((item) => item.jobTitle || item.companyName || item.description || item.managerEmail);
        return body;
      }

      if (field === "education") {
        body[field] = (form.education || [])
          .map((item) => ({
            ...(item._id ? { _id: item._id } : {}),
            institution: item.institution,
            degree: item.degree,
            fieldOfStudy: item.fieldOfStudy,
            startDate: item.startDate || undefined,
            endDate: item.endDate || undefined,
          }))
          .filter((item) => item.institution || item.degree || item.fieldOfStudy || item.startDate || item.endDate);
        return body;
      }

      if (field === "customSections") {
        body[field] = (form.customSections || [])
          .map((section) => ({
            ...(section._id ? { _id: section._id } : {}),
            title: section.title,
            entries: (section.entries || [])
              .map((entry) => ({
                ...(entry._id ? { _id: entry._id } : {}),
                title: entry.title,
                organization: entry.organization,
                startDate: entry.startDate || undefined,
                endDate: entry.endDate || undefined,
                description: entry.description,
              }))
              .filter((entry) => entry.title || entry.description),
          }))
          .filter((section) => section.title && section.entries.length);
        return body;
      }

      body[field] = form[field];
      return body;
    }, {});
  }

  function handleSectionSubmit(section, event) {
    event.preventDefault();
    setFeedback({ type: "", message: "" });
    updateMutation.mutate(buildPayload(section.fields));
  }

  function updateExperience(index, field, value) {
    setForm((current) => ({
      ...current,
      experience: (current.experience || []).map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
              ...(field === "isCurrent" && value ? { endDate: "" } : {}),
            }
          : item
      ),
    }));
  }

  function addExperience() {
    setForm((current) => ({
      ...current,
      experience: [...(current.experience || []), createEmptyExperience()],
    }));
  }

  function removeExperience(index) {
    setForm((current) => ({
      ...current,
      experience: (current.experience || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateEducation(index, field, value) {
    setForm((current) => ({
      ...current,
      education: (current.education || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addEducation() {
    setForm((current) => ({
      ...current,
      education: [...(current.education || []), createEmptyEducation()],
    }));
  }

  function removeEducation(index) {
    setForm((current) => ({
      ...current,
      education: (current.education || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateCustomSectionTitle(index, value) {
    setForm((current) => ({
      ...current,
      customSections: (current.customSections || []).map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, title: value } : section
      ),
    }));
  }

  function addCustomSection() {
    setForm((current) => ({
      ...current,
      customSections: [...(current.customSections || []), createEmptyCustomSection()],
    }));
  }

  function removeCustomSection(index) {
    setForm((current) => ({
      ...current,
      customSections: (current.customSections || []).filter((_, sectionIndex) => sectionIndex !== index),
    }));
  }

  function updateCustomSectionEntry(sectionIndex, entryIndex, field, value) {
    setForm((current) => ({
      ...current,
      customSections: (current.customSections || []).map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? {
              ...section,
              entries: (section.entries || []).map((entry, currentEntryIndex) =>
                currentEntryIndex === entryIndex ? { ...entry, [field]: value } : entry
              ),
            }
          : section
      ),
    }));
  }

  function addCustomSectionEntry(sectionIndex) {
    setForm((current) => ({
      ...current,
      customSections: (current.customSections || []).map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? { ...section, entries: [...(section.entries || []), createEmptyCustomSectionEntry()] }
          : section
      ),
    }));
  }

  function removeCustomSectionEntry(sectionIndex, entryIndex) {
    setForm((current) => ({
      ...current,
      customSections: (current.customSections || []).map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? { ...section, entries: (section.entries || []).filter((_, currentEntryIndex) => currentEntryIndex !== entryIndex) }
          : section
      ),
    }));
  }

  function updateSkillGroup(index, field, value) {
    setForm((current) => ({
      ...current,
      skillGroups: (current.skillGroups || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addSkillGroup() {
    setForm((current) => ({
      ...current,
      skillGroups: [...(current.skillGroups || []), createEmptySkillGroup()],
    }));
  }

  function removeSkillGroup(index) {
    setForm((current) => ({
      ...current,
      skillGroups: (current.skillGroups || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  const sections = session?.role === "organization" ? organizationSections : seekerSections;

  const statValues =
    session?.role === "organization"
      ? [
          { label: "Verification", value: profile.verificationStatus || "Pending", hint: "Organization review state" },
          { label: "Domain", value: profile.domainMatched ? "Matched" : "Needs review", hint: "Email and website domain status" },
          { label: "Industry", value: profile.industry || "Not added", hint: "Shown on company profile" },
        ]
      : [
          { label: "Skills", value: profile.skills?.length || 0, hint: "Listed on your profile" },
          { label: "Preferred roles", value: profile.preferredRoles?.length || 0, hint: "Used in recommendations and matching" },
          { label: "Open to work", value: profile.openToWork ? "Yes" : "No", hint: "Current candidate visibility" },
          {
            label: "Connections",
            value: acceptedConnectionsQuery.isLoading ? "..." : acceptedConnectionsCount,
            hint: "Accepted people in your network",
          },
        ];

  return (
    <section className="dashboard-stack">
      {session?.role === "seeker" ? (
        <ApplicantProfileCover
          profile={profile}
          connectionCount={acceptedConnectionsQuery.isLoading ? 0 : acceptedConnectionsCount}
          profilePictureUrl={profilePictureUrl}
          backgroundVideoUrl={backgroundVideoUrl}
          onEditProfile={() => setEditingSection("basic")}
          onOpenProfilePictureManager={() => setMediaModal("profilePicture")}
          onOpenBackgroundVideoManager={() => setMediaModal("backgroundVideo")}
          isUploadingBackground={backgroundCoverMutation.isPending}
        />
      ) : null}

      {mediaModal === "profilePicture" ? (
        <ProfileMediaManagerModal
          type="image"
          title="Profile photo"
          mediaUrl={profilePictureUrl}
          hasMedia={Boolean(profile.profilePicture?.filePath)}
          feedback={feedback}
          isUploading={profileCoverPictureMutation.isPending}
          isRemoving={removeCoverMediaMutation.isPending && removeCoverMediaMutation.variables === "/profile/picture"}
          onClose={() => setMediaModal("")}
          onClearFeedback={() => setFeedback({ type: "", message: "" })}
          onFileSelect={handleProfilePictureFileSelect}
          onRemove={() => removeCoverMediaMutation.mutate("/profile/picture")}
        />
      ) : null}

      {mediaModal === "backgroundVideo" ? (
        <ProfileMediaManagerModal
          type="video"
          title="Background video"
          mediaUrl={backgroundVideoUrl}
          hasMedia={Boolean(profile.backgroundVideo?.filePath)}
          feedback={feedback}
          isUploading={backgroundCoverMutation.isPending}
          isRemoving={
            removeCoverMediaMutation.isPending && removeCoverMediaMutation.variables === "/profile/background-video"
          }
          onClose={() => setMediaModal("")}
          onClearFeedback={() => setFeedback({ type: "", message: "" })}
          onFileSelect={handleBackgroundVideoFileSelect}
          onRemove={() => removeCoverMediaMutation.mutate("/profile/background-video")}
        />
      ) : null}

      <section className="stats-grid">
        {statValues.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
        ))}
      </section>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {showOAuthWelcome ? (
        <article className="info-card profile-welcome-card">
          <div>
            <p className="eyebrow">Account ready</p>
            <h3>Your Google account is connected.</h3>
            <p>
              Complete your profile to improve job matches, ATS scores, resume generation,
              and auto-apply quality.
            </p>
          </div>
          <div className="form-inline-action">
            <button type="button" onClick={() => setEditingSection("basic")}>
              Complete Profile
            </button>
            <button
              type="button"
              className="outline-button"
              onClick={() => setSearchParams({})}
            >
              Dismiss
            </button>
          </div>
        </article>
      ) : null}

      <section className="profile-layout">
        <div className="dashboard-stack">
          <article className="info-card profile-create-post-card">
            <div className="section-head">
              <div>
                <h3>Create post</h3>
                <p>Share a professional update, project milestone, or company announcement from a dedicated page.</p>
              </div>
              <Link className="outline-button" to="/posts/create">
                Create post
              </Link>
            </div>
          </article>

          {session?.role === "organization" ? (
            <>
              <article className="info-card organization-logo-card">
                <div className="section-head">
                  <div>
                    <h3>Company logo</h3>
                    <p>This logo appears beside your company name on posted jobs.</p>
                  </div>
                  <CompanyLogo organization={profile} size="lg" />
                </div>
                <div className="company-logo-actions">
                  <label className="resume-upload-dropzone" htmlFor="company-logo-upload">
                    <span className="resume-upload-badge">LOGO</span>
                    <span className="resume-upload-copy">
                      <strong>{getMediaUrl(profile.logo) ? "Replace company logo" : "Upload company logo"}</strong>
                      <small>Use a square PNG, JPG, or WebP image for the cleanest job-card display.</small>
                    </span>
                  </label>
                  <input
                    id="company-logo-upload"
                    className="resume-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        logoMutation.mutate(file);
                      }
                      event.target.value = "";
                    }}
                  />
                  {getMediaUrl(profile.logo) ? (
                    <button
                      type="button"
                      className="outline-button danger-button"
                      disabled={removeLogoMutation.isPending}
                      onClick={() => removeLogoMutation.mutate()}
                    >
                      {removeLogoMutation.isPending ? "Removing..." : "Remove logo"}
                    </button>
                  ) : null}
                </div>
              </article>

              {sections.map((section) => {
                const isEditing = editingSection === section.id;
                const commonProps = {
                  section,
                  isEditing,
                  isSaving: updateMutation.isPending && isEditing,
                  onEdit: () => setEditingSection(section.id),
                  onCancel: () => {
                    resetFields(section.fields);
                    setEditingSection("");
                  },
                  onSubmit: (event) => handleSectionSubmit(section, event),
                };

                if (section.id === "company") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="form-grid">
                        <label className="form-field"><span>Company name</span><input type="text" disabled={!isEditing} value={form.companyName} onChange={(event) => handleChange("companyName", event.target.value)} /></label>
                        <label className="form-field"><span>Phone</span><input type="text" disabled={!isEditing} value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} /></label>
                      </div>
                      <label className="form-field">
                        <span>Organization username</span>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={form.username}
                          onChange={(event) => handleChange("username", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                          placeholder="company_username"
                        />
                        <small>Use 3-30 characters: lowercase letters, numbers, and underscores.</small>
                      </label>
                      <div className="form-grid">
                        <label className="form-field"><span>Industry</span><input type="text" disabled={!isEditing} value={form.industry} onChange={(event) => handleChange("industry", event.target.value)} /></label>
                        <label className="form-field"><span>Company size</span><input type="text" disabled={!isEditing} value={form.companySize} onChange={(event) => handleChange("companySize", event.target.value)} /></label>
                      </div>
                    </ProfileEditSection>
                  );
                }

                if (section.id === "presence") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="form-grid">
                        <label className="form-field"><span>Website</span><input type="url" disabled={!isEditing} value={form.websiteUrl} onChange={(event) => handleChange("websiteUrl", event.target.value)} /></label>
                        <label className="form-field"><span>LinkedIn page</span><input type="url" disabled={!isEditing} value={form.linkedinPage} onChange={(event) => handleChange("linkedinPage", event.target.value)} /></label>
                      </div>
                      <label className="form-field"><span>Description</span><textarea disabled={!isEditing} value={form.description} onChange={(event) => handleChange("description", event.target.value)} rows={6} /></label>
                    </ProfileEditSection>
                  );
                }

                return (
                  <ProfileEditSection key={section.id} {...commonProps}>
                    <div className="form-grid">
                      <label className="form-field"><span>Headquarters</span><input type="text" disabled={!isEditing} value={form.headquartersLocation} onChange={(event) => handleChange("headquartersLocation", event.target.value)} /></label>
                      <label className="form-field"><span>Founded year</span><input type="number" disabled={!isEditing} value={form.foundedYear} onChange={(event) => handleChange("foundedYear", event.target.value)} /></label>
                    </div>
                  </ProfileEditSection>
                );
              })}
            </>
          ) : (
            <>
              <article className="info-card resume-autofill-card">
                <div className="section-head">
                  <div>
                    <h3>Autofill from résumé</h3>
                    <p>Upload your résumé and we'll pre-fill your details. Review and save each section afterward.</p>
                  </div>
                </div>
                <div className="resume-autofill-actions">
                  <label className="resume-upload-dropzone" htmlFor="resume-autofill-upload">
                    <span className="resume-upload-badge">CV</span>
                    <span className="resume-upload-copy">
                      <strong>
                        {resumeAutofillMutation.isPending
                          ? "Reading your résumé…"
                          : "Upload résumé to autofill"}
                      </strong>
                      <small>
                        {resumeAutofillMutation.isPending
                          ? "This runs on-device and can take up to a minute. Please keep this tab open."
                          : "PDF, DOCX, or TXT. Nothing is saved until you review and click Save."}
                      </small>
                    </span>
                  </label>
                  <input
                    id="resume-autofill-upload"
                    className="resume-file-input"
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    disabled={resumeAutofillMutation.isPending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      handleResumeAutofill(file);
                      event.target.value = "";
                    }}
                  />
                </div>

                {resumeAutofillMutation.isPending ? (
                  <p className="resume-autofill-status">Parsing résumé, please wait…</p>
                ) : null}

                {autofillReview ? (
                  <div
                    className={[
                      "resume-autofill-review",
                      autofillReview.usedFallback ? "is-warning" : "is-success",
                    ].join(" ")}
                  >
                    <strong>
                      {autofillReview.usedFallback
                        ? "We filled in what we could."
                        : "Imported from your résumé — review and save."}
                    </strong>
                    <p>
                      Check the pre-filled sections below and edit anything, then click
                      <strong> Save all imported details</strong> to store everything at once.
                    </p>
                    {(autofillReview.projectsCount ||
                      autofillReview.certificationsCount ||
                      autofillReview.achievementsCount) ? (
                      <p>
                        Also importing:
                        {autofillReview.projectsCount ? ` ${autofillReview.projectsCount} project(s)` : ""}
                        {autofillReview.certificationsCount ? ` · ${autofillReview.certificationsCount} certification(s)` : ""}
                        {autofillReview.achievementsCount ? ` · ${autofillReview.achievementsCount} achievement(s)` : ""}
                        .
                      </p>
                    ) : null}
                    {autofillReview.additionalSectionsCount ? (
                      <p>
                        We also found {autofillReview.additionalSectionsCount} section(s) that don't fit a standard
                        category (e.g. coursework, extracurriculars) — see "Additional sections" below.
                      </p>
                    ) : null}
                    {autofillReview.warnings.length ? (
                      <ul>
                        {autofillReview.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="resume-autofill-review__actions">
                      <button
                        type="button"
                        disabled={applyResumeMutation.isPending}
                        onClick={handleSaveAllImported}
                      >
                        {applyResumeMutation.isPending ? "Saving…" : "Save all imported details"}
                      </button>
                      <button
                        type="button"
                        className="outline-button"
                        disabled={applyResumeMutation.isPending}
                        onClick={() => setAutofillReview(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>

              {sections.map((section) => {
                const isEditing = editingSection === section.id;
                const commonProps = {
                  section,
                  isEditing,
                  isSaving: updateMutation.isPending && isEditing,
                  onEdit: () => setEditingSection(section.id),
                  onCancel: () => {
                    resetFields(section.fields);
                    setEditingSection("");
                  },
                  onSubmit: (event) => handleSectionSubmit(section, event),
                };

                if (section.id === "basic") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="form-grid">
                        <label className="form-field"><span>First name</span><input type="text" disabled={!isEditing} value={form.firstName} onChange={(event) => handleChange("firstName", event.target.value)} /></label>
                        <label className="form-field"><span>Last name</span><input type="text" disabled={!isEditing} value={form.lastName} onChange={(event) => handleChange("lastName", event.target.value)} /></label>
                      </div>
                      <label className="form-field">
                        <span>Username</span>
                        <input
                          type="text"
                          disabled={!isEditing}
                          value={form.username}
                          onChange={(event) => handleChange("username", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                          placeholder="your_username"
                        />
                        <small>Use 3-30 characters: lowercase letters, numbers, and underscores.</small>
                      </label>
                      <div className="form-grid">
                        <label className="form-field"><span>Phone</span><input type="text" disabled={!isEditing} value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} /></label>
                        <label className="form-field"><span>Tagline</span><input type="text" disabled={!isEditing} value={form.tagline} onChange={(event) => handleChange("tagline", event.target.value)} /></label>
                      </div>
                      <div className="form-grid">
                        <label className="form-field"><span>Current status</span><select disabled={!isEditing} value={form.currentStatus} onChange={(event) => handleChange("currentStatus", event.target.value)}><option value="Student">Student</option><option value="Professional">Professional</option><option value="Unemployed">Unemployed</option></select></label>
                        <label className="form-field"><span>Expected salary</span><input type="number" disabled={!isEditing} value={form.expectedSalary} onChange={(event) => handleChange("expectedSalary", event.target.value)} /></label>
                      </div>
                      <label className="form-field checkbox-field"><span>Open to work</span><input type="checkbox" disabled={!isEditing} checked={Boolean(form.openToWork)} onChange={(event) => handleChange("openToWork", event.target.checked)} /></label>
                    </ProfileEditSection>
                  );
                }

                if (section.id === "education") {
                  const educationYears = (form.education || []).reduce((total, item) => {
                    const startYear = item.startDate ? Number(String(item.startDate).slice(0, 4)) : 0;
                    const endYear = item.endDate ? Number(String(item.endDate).slice(0, 4)) : 0;
                    return startYear && endYear && endYear > startYear ? total + (endYear - startYear) : total;
                  }, 10);

                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="form-grid">
                        <label className="form-field"><span>University / College</span><input type="text" disabled={!isEditing} value={form.universityName} onChange={(event) => handleChange("universityName", event.target.value)} /></label>
                        <label className="form-field"><span>Degree</span><input type="text" disabled={!isEditing} value={form.degree} onChange={(event) => handleChange("degree", event.target.value)} /></label>
                      </div>
                      <div className="form-grid">
                        <label className="form-field"><span>Major</span><input type="text" disabled={!isEditing} value={form.major} onChange={(event) => handleChange("major", event.target.value)} /></label>
                        <label className="form-field"><span>Graduation year</span><input type="number" disabled={!isEditing} value={form.graduationYear} onChange={(event) => handleChange("graduationYear", event.target.value)} /></label>
                      </div>
                      <label className="form-field"><span>Current GPA</span><input type="number" step="0.01" disabled={!isEditing} value={form.currentGPA} onChange={(event) => handleChange("currentGPA", event.target.value)} /></label>
                      <div className="experience-editor-list">
                        <div className="section-head">
                          <div>
                            <h4>Education history</h4>
                            <p>Schooling from Class 1 to Class 10 is counted as 10 years by default. Total calculated years: {educationYears}</p>
                          </div>
                          {isEditing ? (
                            <button type="button" className="outline-button" onClick={addEducation}>
                              Add education
                            </button>
                          ) : null}
                        </div>
                        {(form.education || []).map((item, index) => (
                          <article key={item._id || index} className="experience-editor-card">
                            <div className="section-head">
                              <div>
                                <h4>{item.degree || "Education entry"}</h4>
                                <p>{item.institution || "Institution not added yet"}</p>
                              </div>
                              {isEditing ? (
                                <button type="button" className="outline-button danger-button" onClick={() => removeEducation(index)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                            <div className="form-grid">
                              <label className="form-field"><span>Institution</span><input type="text" disabled={!isEditing} value={item.institution} onChange={(event) => updateEducation(index, "institution", event.target.value)} placeholder="Sri Chaitanya Junior College" /></label>
                              <label className="form-field"><span>Degree / Class</span><input type="text" disabled={!isEditing} value={item.degree} onChange={(event) => updateEducation(index, "degree", event.target.value)} placeholder="Intermediate, B.Tech, M.S" /></label>
                            </div>
                            <div className="form-grid">
                              <label className="form-field"><span>Field of study</span><input type="text" disabled={!isEditing} value={item.fieldOfStudy} onChange={(event) => updateEducation(index, "fieldOfStudy", event.target.value)} placeholder="MPC, Computer Science, Data Science" /></label>
                              <label className="form-field"><span>Start date</span><input type="date" disabled={!isEditing} value={item.startDate} onChange={(event) => updateEducation(index, "startDate", event.target.value)} /></label>
                            </div>
                            <label className="form-field"><span>End date</span><input type="date" disabled={!isEditing} value={item.endDate} onChange={(event) => updateEducation(index, "endDate", event.target.value)} /></label>
                          </article>
                        ))}
                        {!form.education?.length ? (
                          <div className="empty-state-card">
                            <h4>No education history added yet</h4>
                            <p>Add entries with start and end dates so ATS can calculate total formal education years.</p>
                          </div>
                        ) : null}
                      </div>
                    </ProfileEditSection>
                  );
                }

                if (section.id === "career") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <label className="form-field"><span>Bio</span><textarea disabled={!isEditing} value={form.bio} onChange={(event) => handleChange("bio", event.target.value)} rows={5} /></label>
                      <label className="form-field"><span>Career objective</span><textarea disabled={!isEditing} value={form.careerObjective} onChange={(event) => handleChange("careerObjective", event.target.value)} rows={4} /></label>
                    </ProfileEditSection>
                  );
                }

                if (section.id === "experience") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="experience-editor-list">
                        {(form.experience || []).map((item, index) => (
                          <article key={item._id || index} className="experience-editor-card">
                            <div className="section-head">
                              <div>
                                <h4>{item.jobTitle || "Experience entry"}</h4>
                                <p>{item.companyName || "Company not added yet"}</p>
                              </div>
                              {isEditing ? (
                                <button type="button" className="outline-button danger-button" onClick={() => removeExperience(index)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                            <div className="form-grid">
                              <label className="form-field"><span>Job title</span><input type="text" disabled={!isEditing} value={item.jobTitle} onChange={(event) => updateExperience(index, "jobTitle", event.target.value)} /></label>
                              <label className="form-field"><span>Company name</span><input type="text" disabled={!isEditing} value={item.companyName} onChange={(event) => updateExperience(index, "companyName", event.target.value)} /></label>
                            </div>
                            <div className="form-grid">
                              <label className="form-field"><span>Start date</span><input type="date" disabled={!isEditing} value={item.startDate} onChange={(event) => updateExperience(index, "startDate", event.target.value)} /></label>
                              <label className="form-field"><span>End date</span><input type="date" disabled={!isEditing || item.isCurrent} value={item.endDate} onChange={(event) => updateExperience(index, "endDate", event.target.value)} /></label>
                            </div>
                            <label className="form-field checkbox-field"><span>Currently working here</span><input type="checkbox" disabled={!isEditing} checked={Boolean(item.isCurrent)} onChange={(event) => updateExperience(index, "isCurrent", event.target.checked)} /></label>
                            <label className="form-field"><span>Description</span><textarea disabled={!isEditing} rows={3} value={item.description} onChange={(event) => updateExperience(index, "description", event.target.value)} /></label>
                            <label className="form-field"><span>Manager email for background verification (optional)</span><input type="email" disabled={!isEditing} value={item.managerEmail} onChange={(event) => updateExperience(index, "managerEmail", event.target.value)} placeholder="manager@company.com" /></label>
                          </article>
                        ))}
                        {!form.experience?.length ? (
                          <div className="empty-state-card">
                            <h4>No experience added yet</h4>
                            <p>Freshers can leave this empty. Experienced users can add work history for resumes and verification.</p>
                          </div>
                        ) : null}
                      </div>
                      {isEditing ? (
                        <button type="button" className="outline-button" onClick={addExperience}>
                          Add experience
                        </button>
                      ) : null}
                    </ProfileEditSection>
                  );
                }

                if (section.id === "skills") {
                  const visibleSkillGroups = form.skillGroups?.length
                    ? form.skillGroups
                    : normalizeSkillGroups({ skills: skillsFromCsv(form.skills) });

                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <label className="form-field"><span>Preferred roles</span><input type="text" disabled={!isEditing} value={form.preferredRoles} onChange={(event) => handleChange("preferredRoles", event.target.value)} placeholder="Frontend Developer, Product Engineer" /></label>

                      <div className="skill-group-editor">
                        <div className="section-head">
                          <div>
                            <h4>Skill sections</h4>
                            <p>Add a section name, then list the related skills inside it.</p>
                          </div>
                          {isEditing ? (
                            <button type="button" className="outline-button" onClick={addSkillGroup}>
                              Add skill section
                            </button>
                          ) : null}
                        </div>

                        {visibleSkillGroups.length ? (
                          <div className="skill-group-list">
                            {visibleSkillGroups.map((group, index) => {
                              const groupSkills = fromCsv(group.skills);

                              return (
                                <article key={group._id || index} className="skill-group-card">
                                  <div className="skill-group-inputs">
                                    <label className="form-field">
                                      <span>Skill section name</span>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        value={group.category}
                                        onChange={(event) => updateSkillGroup(index, "category", event.target.value)}
                                        placeholder="Programming, Web Development, Databases"
                                      />
                                    </label>
                                    <label className="form-field">
                                      <span>Skills related to this section</span>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        value={group.skills}
                                        onChange={(event) => updateSkillGroup(index, "skills", event.target.value)}
                                        placeholder="Java, Python, C"
                                      />
                                    </label>
                                  </div>
                                  <div className="skill-group-footer">
                                    <div className="tag-row">
                                      {groupSkills.length ? groupSkills.map((skill) => (
                                        <span key={skill} className="tag-pill">
                                          {skill}
                                        </span>
                                      )) : (
                                        <span className="detail-summary">No skills added in this section yet.</span>
                                      )}
                                    </div>
                                    {isEditing ? (
                                      <button type="button" className="outline-button danger-button" onClick={() => removeSkillGroup(index)}>
                                        Remove
                                      </button>
                                    ) : null}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="empty-state-card">
                            <h4>No skill sections added yet</h4>
                            <p>Click Edit, then add sections like Programming, Web Development, Databases, Cloud, or Testing.</p>
                            {isEditing ? (
                              <button type="button" className="outline-button" onClick={addSkillGroup}>
                                Add first skill section
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="skill-category-preview">
                        <div className="section-head">
                          <div>
                            <h4>Resume preview</h4>
                            <p>These grouped skills will be used in your generated resumes.</p>
                          </div>
                        </div>
                        {visibleSkillGroups.length ? (
                          <div className="skill-category-grid">
                            {visibleSkillGroups.map((group) => (
                              <article key={group.category || group.skills} className="skill-category-card">
                                <strong>{group.category || "Skills"}</strong>
                                <div className="tag-row">
                                  {fromCsv(group.skills).map((skill) => (
                                    <span key={skill} className="tag-pill">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="detail-summary">
                            Add skill sections like Programming: Java, Python, C or Web Development: React.js, Node.js.
                          </p>
                        )}
                      </div>
                    </ProfileEditSection>
                  );
                }

                if (section.id === "customSections") {
                  return (
                    <ProfileEditSection key={section.id} {...commonProps}>
                      <div className="experience-editor-list">
                        {isEditing ? (
                          <button type="button" className="outline-button" onClick={addCustomSection}>
                            Add section
                          </button>
                        ) : null}
                        {(form.customSections || []).map((customSection, sectionIndex) => (
                          <article key={customSection._id || sectionIndex} className="experience-editor-card">
                            <div className="section-head">
                              <div>
                                <label className="form-field">
                                  <span>Section title</span>
                                  <input
                                    type="text"
                                    disabled={!isEditing}
                                    value={customSection.title}
                                    onChange={(event) => updateCustomSectionTitle(sectionIndex, event.target.value)}
                                    placeholder="Relevant Coursework, Extracurricular, Publications"
                                  />
                                </label>
                              </div>
                              {isEditing ? (
                                <button type="button" className="outline-button danger-button" onClick={() => removeCustomSection(sectionIndex)}>
                                  Remove section
                                </button>
                              ) : null}
                            </div>
                            {(customSection.entries || []).map((entry, entryIndex) => (
                              <article key={entry._id || entryIndex} className="experience-editor-card">
                                <div className="section-head">
                                  <div>
                                    <h4>{entry.title || "Entry"}</h4>
                                  </div>
                                  {isEditing ? (
                                    <button
                                      type="button"
                                      className="outline-button danger-button"
                                      onClick={() => removeCustomSectionEntry(sectionIndex, entryIndex)}
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                                <div className="form-grid">
                                  <label className="form-field"><span>Title</span><input type="text" disabled={!isEditing} value={entry.title} onChange={(event) => updateCustomSectionEntry(sectionIndex, entryIndex, "title", event.target.value)} placeholder="Course name, activity, or role" /></label>
                                  <label className="form-field"><span>Organization (optional)</span><input type="text" disabled={!isEditing} value={entry.organization} onChange={(event) => updateCustomSectionEntry(sectionIndex, entryIndex, "organization", event.target.value)} /></label>
                                </div>
                                <div className="form-grid">
                                  <label className="form-field"><span>Start date (optional)</span><input type="date" disabled={!isEditing} value={entry.startDate} onChange={(event) => updateCustomSectionEntry(sectionIndex, entryIndex, "startDate", event.target.value)} /></label>
                                  <label className="form-field"><span>End date (optional)</span><input type="date" disabled={!isEditing} value={entry.endDate} onChange={(event) => updateCustomSectionEntry(sectionIndex, entryIndex, "endDate", event.target.value)} /></label>
                                </div>
                                <label className="form-field"><span>Description (optional)</span><textarea disabled={!isEditing} rows={2} value={entry.description} onChange={(event) => updateCustomSectionEntry(sectionIndex, entryIndex, "description", event.target.value)} /></label>
                              </article>
                            ))}
                            {isEditing ? (
                              <button type="button" className="outline-button" onClick={() => addCustomSectionEntry(sectionIndex)}>
                                Add entry
                              </button>
                            ) : null}
                          </article>
                        ))}
                        {!form.customSections?.length ? (
                          <div className="empty-state-card">
                            <h4>No additional sections yet</h4>
                            <p>These fill automatically when your résumé has content that doesn't fit a standard section, like coursework or extracurriculars.</p>
                          </div>
                        ) : null}
                      </div>
                    </ProfileEditSection>
                  );
                }

                return (
                  <ProfileEditSection key={section.id} {...commonProps}>
                    <div className="form-grid">
                      <label className="form-field"><span>Portfolio URL</span><input type="url" disabled={!isEditing} value={form.portfolioUrl} onChange={(event) => handleChange("portfolioUrl", event.target.value)} /></label>
                      <label className="form-field"><span>LinkedIn URL</span><input type="url" disabled={!isEditing} value={form.linkedinUrl} onChange={(event) => handleChange("linkedinUrl", event.target.value)} /></label>
                    </div>
                    <label className="form-field"><span>GitHub URL</span><input type="url" disabled={!isEditing} value={form.githubUrl} onChange={(event) => handleChange("githubUrl", event.target.value)} /></label>
                  </ProfileEditSection>
                );
              })}
            </>
          )}
        </div>

        <aside className="profile-side-panel">
          <article className="info-card">
            <h3>Current profile snapshot</h3>
            <div className="metric-list">
              <div>
                <span>Name</span>
                <strong>
                  {session?.role === "organization"
                    ? profile.companyName || "Organization"
                    : `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Profile"}
                </strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{session?.email || "Not available"}</strong>
              </div>
              <div>
                <span>Username</span>
                <strong>{profile.username || session?.username || "Not available"}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{session?.role || "Unknown"}</strong>
              </div>
            </div>
          </article>

          <article className="info-card">
            <h3>Portfolio tools</h3>
            <p>Media uploads and portfolio sections are available below for applicants.</p>
            <p>Project and profile changes sync back into the matching system through the backend.</p>
          </article>
        </aside>
      </section>

      <ProfilePortfolioManager session={session} />
    </section>
  );
}
