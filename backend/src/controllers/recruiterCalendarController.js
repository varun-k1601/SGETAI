const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Application = require("../models/Application");
const Interview = require("../models/Interview");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const { createNotification } = require("../services/notificationService");
const googleCalendar = require("../services/googleCalendarService");

/* ===============================================================================================
   RECRUITER ↔ GOOGLE CALENDAR.
   ===============================================================================================
   Connect flow, then scheduling. Every Google request goes through googleCalendarService; nothing
   here builds one.

   WHOSE CALENDAR: req.user.id is the ORGANIZATION on this side of the app, but a calendar grant
   belongs to a person, so every read and write below is keyed to req.user.memberId — the acting
   OrganizationMember. Two recruiters at one company connect, schedule and disconnect completely
   independently of each other.
   =============================================================================================== */

const MAX_INTERVIEW_MINUTES = 8 * 60;
const SCHEDULING_ROLES = ["Owner", "Admin", "Recruiter"];

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

/* The connect and callback endpoints are reached by real top-level browser navigation — the
   recruiter's own click, then Google's server-side redirect — so neither can return JSON to an
   XHR. Both land the user back on a frontend page carrying only a status and a human message.
   NOTHING SENSITIVE GOES IN THIS URL: no token, no code, no account id. */
function redirectToCallbackPage(res, status, extra = {}) {
  const params = new URLSearchParams({ status, ...extra });
  return res.redirect(`${getFrontendUrl()}/recruiter/calendar/callback?${params.toString()}`);
}

// GET /api/recruiter/calendar/connect?token=... — a top-level navigation, so it cannot carry an
// Authorization header. The frontend passes the session token as a query param and it is verified
// here exactly as requireAuth would, then the acting member is re-checked against the database
// rather than trusted from the JWT.
const connectCalendar = asyncHandler(async (req, res) => {
  let user;

  try {
    user = jwt.verify(String(req.query.token || ""), process.env.JWT_SECRET);
  } catch {
    return redirectToCallbackPage(res, "error", {
      message: "Your session expired. Please sign in again and retry."
    });
  }

  if (user.role !== "organization" || !user.memberId) {
    return redirectToCallbackPage(res, "error", {
      message: "Only recruiter accounts can connect a Google Calendar."
    });
  }

  const member = await OrganizationMember.findById(user.memberId);

  if (!member || member.status !== "Active" || !SCHEDULING_ROLES.includes(member.role)) {
    return redirectToCallbackPage(res, "error", {
      message: "You do not have permission to connect a calendar for this organization."
    });
  }

  try {
    return res.redirect(
      googleCalendar.buildAuthorizeUrl({
        memberId: member._id,
        organizationId: member.organizationId
      })
    );
  } catch (error) {
    return redirectToCallbackPage(res, "error", {
      message: error instanceof ApiError ? error.message : "Unable to start the Google Calendar connection."
    });
  }
});

// GET /api/recruiter/calendar/callback — hit by Google's redirect, so it identifies the member
// from the signed `state` rather than from a session.
const calendarCallback = asyncHandler(async (req, res) => {
  try {
    if (req.query.error) {
      throw new ApiError(401, String(req.query.error_description || req.query.error));
    }

    const code = String(req.query.code || "");

    if (!code) {
      throw new ApiError(400, "Google callback is missing its authorization code.");
    }

    const state = googleCalendar.verifyState(req.query.state);
    const member = await OrganizationMember.findById(state.memberId);

    // Re-checked at the moment credentials are stored, not just when the flow began: a member
    // could have been disabled or removed during the round trip to Google.
    if (
      !member ||
      member.status !== "Active" ||
      String(member.organizationId) !== String(state.organizationId)
    ) {
      throw new ApiError(403, "This account can no longer connect a calendar for that organization.");
    }

    const { payload, grantedScopes } = await googleCalendar.exchangeCodeForTokens({ code });
    const identity = await googleCalendar.fetchGoogleIdentity(payload.access_token);

    member.googleCalendarConnection = {
      googleEmail: identity.email || undefined,
      googleUserId: identity.sub || undefined,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      scopes: grantedScopes,
      expiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000),
      connectedAt: new Date(),
      revokedAt: undefined
    };
    await member.save();

    // The email is the only thing that travels back, so the card can name which account is bound.
    return redirectToCallbackPage(res, "success", { account: identity.email || "" });
  } catch (error) {
    return redirectToCallbackPage(res, "error", {
      message: error instanceof ApiError ? error.message : "Google Calendar connection failed."
    });
  }
});

/* GET /api/recruiter/calendar/status — what the integrations card renders from.

   `connected` is a claim about system state, so it is computed from a live grant and nothing else:
   a stored refresh token that Google has not rejected. Not "the feature shipped", not "someone
   once connected". A revoked grant reports connected:false the moment the next refresh fails. */
const getCalendarStatus = asyncHandler(async (req, res) => {
  const configured = googleCalendar.isConfigured();
  // Loaded WITH the tokens, because "connected" means a live refresh token exists — a question
  // that cannot be answered from the ordinary member document, where both tokens are select:false.
  const member = await googleCalendar.loadConnection(req.orgMember._id);
  const connection = member?.googleCalendarConnection;
  /* A stored grant only counts while the server can still act on it. If the credentials or the
     redirect URI are missing, this deployment cannot reach Google at all, so every field derived
     from the grant reports the same thing rather than the payload contradicting itself with
     connected:false beside canSchedule:true and a named account. */
  const live = configured && googleCalendar.isLive(connection);

  return sendSuccess(res, {
    // False in an environment with no Google credentials, which is what makes the card fall back
    // to the same "not yet available" treatment the other five connectors carry permanently.
    configured,
    connected: live,
    googleEmail: live ? connection?.googleEmail || null : null,
    connectedAt: live ? connection?.connectedAt || null : null,
    // Reported so the UI can explain a connection that exists but cannot write events, rather
    // than showing a Connect button that appears to do nothing.
    canSchedule: Boolean(live && connection?.scopes?.includes(googleCalendar.CALENDAR_SCOPE)),
    revokedAt: connection?.revokedAt || null
  });
});

const disconnectCalendar = asyncHandler(async (req, res) => {
  const member = await googleCalendar.loadConnection(req.orgMember._id);

  if (!member?.googleCalendarConnection) {
    return sendSuccess(res, { message: "No Google Calendar is connected." });
  }

  // Tell Google to drop the grant too, so it disappears from the member's own account permissions
  // page rather than lingering as an app they believe they removed. Best-effort by design.
  await googleCalendar.revokeToken(member.googleCalendarConnection.refreshToken);

  member.googleCalendarConnection = undefined;
  await member.save();

  return sendSuccess(res, { message: "Google Calendar disconnected." });
});

// ---------------------------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------------------------

function parseWindow(body) {
  const startAt = new Date(body.startAt);
  const durationMinutes = Number(body.durationMinutes || 45);

  if (Number.isNaN(startAt.getTime())) {
    throw new ApiError(400, "startAt must be a valid date and time.");
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > MAX_INTERVIEW_MINUTES) {
    throw new ApiError(400, "durationMinutes must be between 5 and 480.");
  }

  const timezone = String(body.timezone || "").trim();

  /* An IANA zone is required rather than defaulted. Guessing the server's zone would put the
     interview in the wrong hour for everyone involved and give no sign that it had happened. */
  if (!timezone) {
    throw new ApiError(400, "timezone is required (an IANA name such as Asia/Kolkata).");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new ApiError(400, `"${timezone}" is not a recognised IANA timezone.`);
  }

  return { startAt, endAt: new Date(startAt.getTime() + durationMinutes * 60000), timezone };
}

// Loads an application and proves the caller's organization owns the job it is for. The member's
// role was already checked by requireOrgMemberRole on the route; this is the tenant check.
async function loadApplicationForOrg(applicationId, organizationId) {
  const application = await Application.findById(applicationId);

  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  const job = await Job.findById(application.jobId);

  if (!job || String(job.organizationId) !== String(organizationId)) {
    throw new ApiError(403, "You can only schedule interviews for your own jobs.");
  }

  return { application, job };
}

async function notifySeeker(interview, { job, organizationName, type, title, message }) {
  await createNotification({
    recipientId: interview.jobSeekerId,
    recipientRole: "seeker",
    type,
    title,
    message,
    metadata: {
      applicationId: interview.applicationId,
      jobId: job._id,
      interviewId: interview._id,
      startAt: interview.startAt,
      timezone: interview.timezone,
      meetLink: interview.meetLink || null,
      organizationName
    }
  });
}

function serializeInterview(interview) {
  return {
    _id: interview._id,
    applicationId: interview.applicationId,
    startAt: interview.startAt,
    endAt: interview.endAt,
    timezone: interview.timezone,
    title: interview.title,
    notes: interview.notes,
    meetLink: interview.meetLink,
    htmlLink: interview.htmlLink,
    status: interview.status,
    scheduledByMemberId: interview.scheduledByMemberId
    /* googleEventId is deliberately not a field here — it is the handle this app addresses the
       event by, and no client needs it. htmlLink IS returned: it is Google's own "open this
       event" URL, so it necessarily encodes the event, but it is the recruiter's own event on
       their own calendar and opening it is the point. Neither token appears in either. */
  };
}

/* POST /api/recruiter/calendar/applications/:applicationId/interview

   SCHEDULING IS ITS OWN ACTION, and it sets the status as a side effect — not the other way
   round. Moving an application to "Interview" from the status dropdown creates nothing: a status
   change carries no time, no duration and no timezone, so it could only ever invent them, and a
   recruiter correcting a mis-click would have already emailed the candidate an invite by then.
   Scheduling here is explicit, carries the time the recruiter chose, and moves the application to
   "Interview" because that is unambiguously what just happened. */
const scheduleInterview = asyncHandler(async (req, res) => {
  const { application, job } = await loadApplicationForOrg(req.params.applicationId, req.user.id);

  if (application.status === "Withdrawn") {
    throw new ApiError(400, "This application was withdrawn and cannot be scheduled.");
  }

  const existing = await Interview.findOne({
    applicationId: application._id,
    status: "Scheduled"
  });

  if (existing) {
    throw new ApiError(409, "This application already has a scheduled interview. Reschedule it instead.");
  }

  const { startAt, endAt, timezone } = parseWindow(req.body || {});
  const member = await googleCalendar.loadConnection(req.orgMember._id);
  const [seeker, organization] = await Promise.all([
    JobSeeker.findById(application.jobSeekerId).select("firstName lastName email"),
    Organization.findById(application.organizationId).select("companyName")
  ]);

  if (!seeker?.email) {
    throw new ApiError(400, "This candidate has no email address on their profile, so they cannot be invited.");
  }

  const title = String(req.body?.title || "").trim() || `Interview — ${job.title}`;
  const notes = String(req.body?.notes || "").trim();
  const description = [
    `Interview for ${job.title} at ${organization?.companyName || "our team"}.`,
    notes
  ]
    .filter(Boolean)
    .join("\n\n");

  // The candidate is invited at the email on their own JobSeeker record — Google sends the invite,
  // and it goes to the address they actually use.
  const event = await googleCalendar.createEvent(member, {
    title,
    description,
    startAt,
    endAt,
    timezone,
    attendeeEmail: seeker.email
  });

  const interview = await Interview.create({
    applicationId: application._id,
    jobId: job._id,
    organizationId: application.organizationId,
    jobSeekerId: application.jobSeekerId,
    scheduledByMemberId: req.orgMember._id,
    startAt,
    endAt,
    timezone,
    title,
    notes,
    googleEventId: event.googleEventId,
    meetLink: event.meetLink,
    htmlLink: event.htmlLink,
    status: "Scheduled"
  });

  application.status = "Interview";
  await application.save();

  /* The in-app notification is not a duplicate of Google's invite — it is the only channel this
     product controls. A calendar invite that lands in spam must not be the sole signal that
     someone has an interview tomorrow. */
  await notifySeeker(interview, {
    job,
    organizationName: organization?.companyName,
    type: "interview_scheduled",
    title: "Interview scheduled",
    message: `${organization?.companyName || "A recruiter"} scheduled your interview for ${job.title}.`
  });

  return sendSuccess(res, {
    message: "Interview scheduled and the candidate has been invited.",
    interview: serializeInterview(interview)
  });
});

/* PATCH /api/recruiter/calendar/interviews/:interviewId — updates the SAME Google event, keyed by
   the stored googleEventId, so the candidate's existing invite moves rather than a second one
   arriving beside it. */
const rescheduleInterview = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId);

  if (!interview || String(interview.organizationId) !== String(req.user.id)) {
    throw new ApiError(404, "Interview not found.");
  }

  if (interview.status !== "Scheduled") {
    throw new ApiError(400, "Only a scheduled interview can be rescheduled.");
  }

  const { startAt, endAt, timezone } = parseWindow(req.body || {});
  const [job, seeker, organization] = await Promise.all([
    Job.findById(interview.jobId),
    JobSeeker.findById(interview.jobSeekerId).select("email"),
    Organization.findById(interview.organizationId).select("companyName")
  ]);

  /* The event lives on the calendar of the member who created it, under their grant, so it is
     their credentials that can move it — not those of whoever happens to be clicking now. If that
     member has since disconnected, say so plainly instead of silently creating a duplicate event
     on someone else's calendar. */
  const member = await googleCalendar.loadConnection(interview.scheduledByMemberId);

  if (!googleCalendar.isLive(member?.googleCalendarConnection)) {
    throw new ApiError(
      409,
      "The calendar this interview was created on is no longer connected, so the event cannot be updated. Cancel it and schedule a new one."
    );
  }

  const event = await googleCalendar.updateEvent(member, {
    googleEventId: interview.googleEventId,
    calendarId: interview.googleCalendarId,
    title: interview.title,
    description: interview.notes,
    startAt,
    endAt,
    timezone,
    attendeeEmail: seeker?.email
  });

  interview.startAt = startAt;
  interview.endAt = endAt;
  interview.timezone = timezone;
  interview.meetLink = event.meetLink || interview.meetLink;
  await interview.save();

  await notifySeeker(interview, {
    job,
    organizationName: organization?.companyName,
    type: "interview_rescheduled",
    title: "Interview rescheduled",
    message: `Your interview for ${job?.title || "a role"} was moved to a new time.`
  });

  return sendSuccess(res, {
    message: "Interview rescheduled and the candidate has been notified.",
    interview: serializeInterview(interview)
  });
});

// DELETE /api/recruiter/calendar/interviews/:interviewId — cancels the Google event too. Flipping
// the local row alone would leave the event sitting on both calendars, which is worse than never
// having cancelled: the candidate would still show up.
const cancelInterview = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.interviewId);

  if (!interview || String(interview.organizationId) !== String(req.user.id)) {
    throw new ApiError(404, "Interview not found.");
  }

  if (interview.status !== "Scheduled") {
    throw new ApiError(400, "This interview is not scheduled.");
  }

  const member = await googleCalendar.loadConnection(interview.scheduledByMemberId);

  if (googleCalendar.isLive(member?.googleCalendarConnection)) {
    await googleCalendar.cancelEvent(member, {
      googleEventId: interview.googleEventId,
      calendarId: interview.googleCalendarId
    });
  }

  interview.status = "Cancelled";
  interview.cancelledAt = new Date();
  interview.cancelledByMemberId = req.orgMember._id;
  await interview.save();

  const [job, organization] = await Promise.all([
    Job.findById(interview.jobId),
    Organization.findById(interview.organizationId).select("companyName")
  ]);

  await notifySeeker(interview, {
    job,
    organizationName: organization?.companyName,
    type: "interview_cancelled",
    title: "Interview cancelled",
    message: `Your interview for ${job?.title || "a role"} was cancelled by ${organization?.companyName || "the recruiter"}.`
  });

  return sendSuccess(res, {
    message: "Interview cancelled and the candidate has been notified.",
    interview: serializeInterview(interview)
  });
});

module.exports = {
  connectCalendar,
  calendarCallback,
  getCalendarStatus,
  disconnectCalendar,
  scheduleInterview,
  rescheduleInterview,
  cancelInterview,
  serializeInterview,
  SCHEDULING_ROLES
};
