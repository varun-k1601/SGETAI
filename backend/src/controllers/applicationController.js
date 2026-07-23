const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

const Application = require("../models/Application");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const { createNotification } = require("../services/notificationService");
const { sendEmail } = require("../utils/email");
const { downloadFile } = require("../utils/supabaseService");
const { compileLatexToPdf } = require("../services/latexCompilerService");

function sanitizeDownloadFileName(fileName, fallback = "candidate-resume") {
  return String(fileName || fallback)
    .replace(/[\r\n"]/g, "")
    .trim() || fallback;
}

function getContentTypeFromFileName(fileName) {
  const extension = String(fileName || "").toLowerCase().split(".").pop();

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "doc") {
    return "application/msword";
  }

  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (extension === "txt") {
    return "text/plain; charset=utf-8";
  }

  if (extension === "tex") {
    return "application/x-tex; charset=utf-8";
  }

  return "application/octet-stream";
}

async function downloadResumeFromUrl(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Resume URL fetch failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getVerificationEligibility(seeker) {
  const experience = Array.isArray(seeker?.experience) ? seeker.experience : [];
  const hasExperience = experience.length > 0;
  const hasVerifiableExperience = experience.some((item) => Boolean(item.managerEmail));

  if (hasVerifiableExperience) {
    return {
      eligible: true,
      hasExperience,
      hasManagerEmail: true,
      label: "Available",
      reason: "At least one experience entry includes a manager email."
    };
  }

  if (hasExperience) {
    return {
      eligible: false,
      hasExperience,
      hasManagerEmail: false,
      label: "Unavailable",
      reason: "Add a manager email to an experience entry to enable background verification."
    };
  }

  return {
    eligible: false,
    hasExperience: false,
    hasManagerEmail: false,
    label: "Not required",
    reason: "Freshers or applicants without experience do not need background verification."
  };
}

const getMyApplications = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view their applications.");
  }

  const [applications, seeker] = await Promise.all([
    Application.find({ jobSeekerId: req.user.id })
      .populate({
        path: "jobId",
        select: "title location industry type status"
      })
      .populate({
        path: "organizationId",
        select: "companyName industry headquartersLocation logo"
      })
      .sort({ createdAt: -1 }),
    JobSeeker.findById(req.user.id).select("experience")
  ]);
  const verificationEligibility = getVerificationEligibility(seeker);

  return sendSuccess(res, {
    message: "Applications fetched successfully.",
    verificationEligibility,
    applications: applications.map((application) => ({
      ...application.toObject(),
      verificationEligibility
    }))
  });
});

const updateApplicationStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can update application status.");
  }

  const { status } = req.body;

  if (!["Pending", "UnderReview", "Interview", "Accepted", "Rejected"].includes(status)) {
    throw new ApiError(400, "status must be Pending, UnderReview, Interview, Accepted, or Rejected.");
  }

  const application = await Application.findById(req.params.id);

  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  const job = await Job.findById(application.jobId);

  if (!job || job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only update applications for your own jobs.");
  }

  if (application.status === "Withdrawn") {
    throw new ApiError(400, "Withdrawn applications cannot be updated by recruiters.");
  }

  application.status = status;

  if (status === "Accepted" && !application.acceptedAt) {
    application.acceptedAt = new Date();
  }

  await application.save();

  const [seeker, organization] = await Promise.all([
    JobSeeker.findById(application.jobSeekerId).select("firstName lastName email"),
    Organization.findById(application.organizationId).select("companyName")
  ]);

  await createNotification({
    recipientId: application.jobSeekerId,
    recipientRole: "seeker",
    type: "application_status",
    title: "Application status updated",
    message: `Your application for ${job.title} at ${organization?.companyName || "the recruiter"} was updated to ${status}.`,
    metadata: { applicationId: application._id, jobId: application.jobId, status }
  });

  if (seeker?.email) {
    sendEmail(
      seeker.email,
      `Application update: ${job.title}`,
      `
        <p>Hi ${seeker.firstName || "there"},</p>
        <p>Your application for <strong>${job.title}</strong> at <strong>${organization?.companyName || "the recruiter"}</strong> is now <strong>${status}</strong>.</p>
        <p>Open your SGETAI applications page to track the next step.</p>
      `
    ).catch((error) => {
      console.error("Application status email failed:", error.message);
    });
  }

  return sendSuccess(res, {
    message: "Application status updated successfully.",
    application
  });
});

const withdrawApplication = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can withdraw applications.");
  }

  const application = await Application.findById(req.params.id);

  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  if (application.jobSeekerId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only withdraw your own applications.");
  }

  if (application.status === "Withdrawn") {
    throw new ApiError(400, "This application is already withdrawn.");
  }

  if (["Accepted", "Rejected"].includes(application.status)) {
    throw new ApiError(400, "Final-decision applications cannot be withdrawn.");
  }

  application.status = "Withdrawn";
  application.withdrawnAt = new Date();
  await application.save();

  const [job, seeker, organization] = await Promise.all([
    Job.findById(application.jobId).select("title"),
    JobSeeker.findById(application.jobSeekerId).select("firstName lastName email"),
    Organization.findById(application.organizationId).select("companyName")
  ]);

  await createNotification({
    recipientId: application.organizationId,
    recipientRole: "organization",
    type: "application_withdrawn",
    title: "Application withdrawn",
    message: `${seeker?.firstName || "A candidate"} ${seeker?.lastName || ""}`.trim() +
      ` withdrew their application for ${job?.title || "a job"}.`,
    metadata: { applicationId: application._id, jobId: application.jobId, status: "Withdrawn" }
  });

  if (seeker?.email) {
    sendEmail(
      seeker.email,
      `Application withdrawn: ${job?.title || "job application"}`,
      `
        <p>Hi ${seeker.firstName || "there"},</p>
        <p>Your application for <strong>${job?.title || "the selected role"}</strong> at <strong>${organization?.companyName || "the recruiter"}</strong> has been withdrawn.</p>
        <p>You can continue exploring other jobs from your SGETAI dashboard.</p>
      `
    ).catch((error) => {
      console.error("Application withdrawal email failed:", error.message);
    });
  }

  return sendSuccess(res, {
    message: "Application withdrawn successfully.",
    application
  });
});

const downloadApplicationResume = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);

  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  const isApplicationOwner =
    req.user.role === "seeker" && application.jobSeekerId.toString() === req.user.id;
  const isRecruiterOwner =
    req.user.role === "organization" && application.organizationId.toString() === req.user.id;

  if (!isApplicationOwner && !isRecruiterOwner) {
    throw new ApiError(403, "You can only access resumes for your own applications.");
  }

  const disposition = req.query.disposition === "inline" ? "inline" : "attachment";

  if (application.attachedResume?.media?.filePath || application.attachedResume?.media?.url) {
    let fileBuffer;

    try {
      fileBuffer = application.attachedResume.media.filePath
        ? await downloadFile(application.attachedResume.media.filePath)
        : await downloadResumeFromUrl(application.attachedResume.media.url);
    } catch (error) {
      throw new ApiError(
        502,
        "Resume storage is not reachable. Please verify the Supabase bucket configuration.",
        {
          storagePath: application.attachedResume.media.filePath,
          storageUrl: application.attachedResume.media.url,
          storageError: error.message
        }
      );
    }

    const fileName = sanitizeDownloadFileName(
      application.attachedResume.originalName,
      "candidate-resume"
    );

    res.setHeader("Content-Type", getContentTypeFromFileName(fileName));
    res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
    return res.send(fileBuffer);
  }

  if (application.tailoredResume?.latex) {
    const { pdfBuffer, fileName } = await compileLatexToPdf(
      application.tailoredResume.latex,
      application.tailoredResume.fileName || "candidate-tailored-resume.tex"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  }

  throw new ApiError(404, "No resume is attached to this application.");
});

module.exports = {
  getMyApplications,
  updateApplicationStatus,
  withdrawApplication,
  downloadApplicationResume
};
