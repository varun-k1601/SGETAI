const mongoose = require("mongoose");

/* A SCHEDULED INTERVIEW — the thing the Google Calendar connector actually creates.
   ================================================================================================
   Nothing like this existed before. Application.status had "Interview" in its enum since the
   beginning, but an application could sit in that status with no time, no link and no record of
   who set it: the card promised "Schedule interviews directly from candidate profiles" and there
   was nothing on either side of the app to schedule.

   googleEventId is the field that makes this an integration rather than a one-way emitter. Without
   it the app can create an event and then never touch it again — a reschedule would create a
   SECOND invite on the candidate's calendar and a cancellation would flip a local row while the
   original event sat on the recruiter's calendar forever. Every update and cancellation addresses
   the event by this id.

   scheduledByMemberId is not audit decoration either. The event lives on THAT member's Google
   calendar under THAT member's OAuth grant (see OrganizationMember.googleCalendarConnection), so
   it is the only credential that can later modify or cancel it.

   Times are stored as absolute instants (Date) with the IANA timezone kept alongside. The zone is
   not redundant: it is what was sent to Google as the event's own timeZone, and it is how the app
   can render "2pm your time" for a candidate in another zone without re-deriving what the
   recruiter meant. */
const interviewSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    // The person whose calendar this lives on, and whose token can change it.
    scheduledByMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationMember",
      required: true
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    // IANA zone (e.g. "Asia/Kolkata"), sent to Google verbatim as the event timeZone. A naive
    // local time here would land the interview in the wrong hour for anyone in another zone.
    timezone: { type: String, trim: true, required: true },
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    // Google's own id for the event. The handle for every later update or cancellation.
    googleEventId: { type: String, trim: true, index: true },
    googleCalendarId: { type: String, trim: true, default: "primary" },
    meetLink: { type: String, trim: true },
    htmlLink: { type: String, trim: true },
    status: {
      type: String,
      enum: ["Scheduled", "Cancelled", "Completed"],
      default: "Scheduled"
    },
    cancelledAt: Date,
    cancelledByMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationMember"
    }
  },
  { timestamps: true }
);

// The seeker's Applied Jobs page asks "is there a live interview for this application?" on every
// row, and the recruiter's applicant list asks the same per candidate.
interviewSchema.index({ applicationId: 1, status: 1 });

module.exports = mongoose.model("Interview", interviewSchema);
