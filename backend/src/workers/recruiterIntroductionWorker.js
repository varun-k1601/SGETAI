const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const ChatSession = require("../models/ChatSession");
const ChatMessage = require("../models/ChatMessage");
const RecruiterIntroduction = require("../models/RecruiterIntroduction");
const RecruiterIntroductionRun = require("../models/RecruiterIntroductionRun");
const { createNotification } = require("../services/notificationService");
const { emitToUser } = require("../utils/socketServer");
const {
  getProAutoApplyPolicy,
  getProRecruiterIntroPolicy
} = require("../services/platformSettingsService");
const { computeAutoApplyCompositeMatch } = require("../services/matchService");
const { generateRecruiterDm } = require("../services/geminiGenerativeService");
const { buildProfileForTailoring } = require("../services/resumeGenerationService");
const {
  findCandidatesForJob,
  computePairVectorScore,
  hasLocationMatch,
  hasSalaryMatch,
  isExcludedCompany,
  ensureRecruiterNetwork,
  buildParticipantKey,
  incrementReason
} = require("./autoApplyWorker");

// Only Pro seekers who explicitly turned introductions on. autoApplyPreferences.enabled is
// deliberately NOT part of this — running auto-apply and authorizing contact with a named human
// are separate consents.
//
// The two channel flags (autoConnectEnabled / autoDMEnabled) are deliberately NOT in this filter
// even though they gate real behavior now: an $or over them can't be expressed as a $vectorSearch
// filter unless both are declared filter fields in the Atlas index, and a filter that silently
// fails there would be worse than no filter. They are enforced per candidate instead, in the same
// pass that re-checks isPro and the master opt-in — see resolveIntroductionChannels below.
const INTRODUCTION_CANDIDATE_FILTER = {
  isPro: true,
  "autoApplyPreferences.autoIntroduceToRecruiters": true
};

// The seeker's two independent consents, resolved into what this run is allowed to do for them.
//
// `connect` authorizes the introduction itself: the RecruiterIntroduction request to the HR member
// plus the Follow/ChatSession that ensureRecruiterNetwork upserts. `dm` authorizes an AI-drafted
// first message being sent under the seeker's own name on top of that.
//
// dm-without-connect is refused rather than silently upgraded: the toggle reads "Send a first
// message AFTER connecting", so a message with no connection is not a thing the seeker agreed to.
function resolveIntroductionChannels(seeker) {
  const preferences = seeker?.autoApplyPreferences || {};

  return {
    connect: Boolean(preferences.autoConnectEnabled),
    dm: Boolean(preferences.autoDMEnabled)
  };
}

// How many top matched skills are handed to the drafting prompt as the justification for
// reaching out. Small on purpose: a longer list reads as keyword stuffing in a 60-120 word note.
const MAX_MATCHED_SKILLS_IN_CONTEXT = 5;

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function getMemberDisplayName(member) {
  return `${member?.firstName || ""} ${member?.lastName || ""}`.trim() || "the hiring team";
}

// Candidates arrive either as Mongoose documents (text fallback path) or as plain objects
// ($vectorSearch aggregation path), so neither .toObject() nor direct spreading is safe alone.
function toPlainSeeker(seeker) {
  return typeof seeker?.toObject === "function" ? seeker.toObject() : { ...seeker };
}

// Same atomic reserve-then-release pattern as reserveAutoApplySlot: the conditional
// findOneAndUpdate is what makes the daily cap hold under concurrent runs (two jobs published at
// once), because checking-then-incrementing would let both pass the check.
async function reserveIntroductionSlot(seekerId, maxDailyIntroductions) {
  return JobSeeker.findOneAndUpdate(
    {
      _id: seekerId,
      recruiterIntroCountToday: { $lt: maxDailyIntroductions }
    },
    {
      $inc: { recruiterIntroCountToday: 1 }
    },
    {
      new: true,
      projection: { _id: 1, recruiterIntroCountToday: 1 }
    }
  );
}

async function releaseIntroductionSlot(seekerId) {
  await JobSeeker.updateOne(
    {
      _id: seekerId,
      recruiterIntroCountToday: { $gt: 0 }
    },
    {
      $inc: { recruiterIntroCountToday: -1 }
    }
  );
}

// One query for every candidate instead of one per candidate — the N+1 shape in
// runAutoApplyForSeeker is the thing to avoid here, since this loop can span 200 seekers.
async function getAlreadyIntroducedSeekerIds(jobId, hrMemberId, seekerIds) {
  if (!seekerIds.length) {
    return new Set();
  }

  const introductions = await RecruiterIntroduction.find({
    jobId,
    hrMemberId,
    jobSeekerId: { $in: seekerIds }
  }).select("jobSeekerId");

  return new Set(introductions.map((introduction) => introduction.jobSeekerId.toString()));
}

function getTopMatchedSkills(match) {
  return [
    ...(match?.reasoning?.matchedSkills || []),
    ...(match?.reasoning?.matchedRequirements || [])
  ]
    .filter(Boolean)
    .slice(0, MAX_MATCHED_SKILLS_IN_CONTEXT);
}

// The drafting prompt only ever receives facts that are already true and verifiable — the real
// job title, the real company, the real recruiter name, and the skills the match reasoning
// actually credited. generateRecruiterDm is separately instructed to use only truthful profile
// evidence, so nothing here invites it to embellish.
function buildIntroductionContext({ job, organization, hrMember, matchedSkills, matchScore }) {
  const companyName = organization?.companyName || "the company";
  const skillLine = matchedSkills.length
    ? `Skills the match was based on: ${matchedSkills.join(", ")}.`
    : "";

  return [
    `Introduce the candidate to ${getMemberDisplayName(hrMember)}, the recruiter who just posted`,
    `the role "${job.title}" at ${companyName}.`,
    skillLine,
    `The platform scored the candidate's profile at ${matchScore}% match for this role.`,
    "This is a first-contact note, so it must be brief and must not assume any prior conversation."
  ]
    .filter(Boolean)
    .join(" ");
}

// The connect half, on its own. This is everything "Auto-connect" authorizes: the Follow and the
// seeker <-> organization ChatSession that ensureRecruiterNetwork upserts, which together are what
// "connected to this recruiter" means in this app. Runs for connection-only introductions too, so
// a seeker who declined auto-DM still ends up able to message the recruiter themselves.
async function establishIntroductionConnection({ seeker, job }) {
  await ensureRecruiterNetwork(seeker, job);

  const participantKey = buildParticipantKey(
    `seeker:${seeker._id}`,
    `organization:${job.organizationId}`
  );

  return ChatSession.findOne({ participantKey });
}

// The message half. Delivers into the org-level thread established above (see the SCHEMA DECISION
// comment on RecruiterIntroduction). Sender is the seeker, so the message lands in the seeker's own
// chat thread exactly like anything they typed themselves — never send on someone's behalf
// something they cannot see — and the metadata stamp is what both chat UIs use to label it as
// AI-drafted and auto-sent.
async function deliverIntroductionMessage({ seeker, job, hrMember, introduction, content, session }) {
  const message = await ChatMessage.create({
    sessionId: session._id,
    senderId: seeker._id,
    senderRole: "seeker",
    content,
    readBy: [seeker._id],
    metadata: {
      aiAssisted: true,
      autoSent: true,
      source: "recruiter_introduction",
      introductionId: introduction._id,
      jobId: job._id,
      jobTitle: job.title,
      hrMemberId: hrMember._id,
      hrMemberName: getMemberDisplayName(hrMember)
    }
  });

  session.lastMessage = content.slice(0, 240);
  session.lastMessageAt = message.createdAt;
  await session.save();

  emitToUser(
    { id: job.organizationId.toString(), role: "organization" },
    "chat:message",
    { sessionId: session._id, message }
  );
  // The seeker gets the same socket event as the recruiter: this appears in their thread, so
  // their open chat window must update the same way it would for a message they sent.
  emitToUser(
    { id: seeker._id.toString(), role: "seeker" },
    "chat:message",
    { sessionId: session._id, message }
  );

  return { session, message };
}

async function runRecruiterIntroductionsForJob(jobId, options = {}) {
  const runLog = {
    jobId,
    source: options.source === "job_published" ? "job_published" : "job_created",
    ranAt: new Date(),
    ready: false,
    candidatesEvaluated: 0,
    introductionsCreated: 0,
    introducedSeekerIds: [],
    skippedReasons: {},
    warnings: [],
    errors: []
  };

  try {
    const job = await Job.findById(jobId).select("+hiddenRoles +embedding");

    if (!job || !job.isActive || job.status !== "Active") {
      incrementReason(runLog.skippedReasons, "job_inactive_or_missing");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    runLog.organizationId = job.organizationId;

    // Jobs created before team accounts existed have no posting member. There is no correct
    // person to introduce anyone to in that case, and messaging the whole organization instead
    // would turn a targeted introduction into untargeted outreach — so this is a clean skip with
    // a recorded reason, not a fallback.
    if (!job.postedByMemberId) {
      incrementReason(runLog.skippedReasons, "job_has_no_posting_member");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    const introPolicy = await getProRecruiterIntroPolicy();

    if (introPolicy.enabled === false) {
      incrementReason(runLog.skippedReasons, "platform_introductions_disabled");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    const [hrMember, organization, autoApplyPolicy] = await Promise.all([
      OrganizationMember.findById(job.postedByMemberId).select(
        "firstName lastName status organizationId recruiterIntroOptOut"
      ),
      Organization.findById(job.organizationId).select("companyName"),
      getProAutoApplyPolicy()
    ]);

    if (!hrMember || hrMember.status !== "Active") {
      incrementReason(runLog.skippedReasons, "hr_member_inactive_or_missing");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    runLog.hrMemberId = hrMember._id;

    if (hrMember.recruiterIntroOptOut) {
      incrementReason(runLog.skippedReasons, "hr_member_opted_out");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    // The same threshold resolution auto-apply uses for this job, read from the same policy — the
    // two features must never disagree about who clears the bar for one posting.
    const threshold = Number(job.autoApplyThreshold ?? autoApplyPolicy.matchThreshold ?? 70);
    const [introductionsForThisJob, introductionsForHrToday] = await Promise.all([
      RecruiterIntroduction.countDocuments({ hrMemberId: hrMember._id, jobId: job._id }),
      RecruiterIntroduction.countDocuments({
        hrMemberId: hrMember._id,
        createdAt: { $gte: startOfToday() }
      })
    ]);
    // Both recruiter-side caps collapse into one budget for this run; whichever is tighter wins.
    let recruiterBudget = Math.min(
      introPolicy.maxIntroductionsPerJobPerRecruiter - introductionsForThisJob,
      introPolicy.maxIntroductionsPerRecruiterPerDay - introductionsForHrToday
    );

    if (recruiterBudget <= 0) {
      incrementReason(runLog.skippedReasons, "recruiter_rate_limited");
      await RecruiterIntroductionRun.create(runLog);
      return runLog;
    }

    const candidates = await findCandidatesForJob(
      job,
      runLog.warnings,
      INTRODUCTION_CANDIDATE_FILTER
    );
    const seekerIds = candidates.map((candidate) => candidate._id);
    const alreadyIntroducedIds = await getAlreadyIntroducedSeekerIds(
      job._id,
      hrMember._id,
      seekerIds
    );

    runLog.ready = true;
    runLog.candidatesEvaluated = candidates.length;

    // Every candidate is filtered and scored BEFORE any message is sent, then delivery runs
    // highest-match-first. The recruiter budget is deliberately tiny (3 per job by default), so
    // first-past-the-post ordering would hand those few slots to whoever the candidate search
    // happened to return first — which, on the keyword fallback path, is effectively arbitrary.
    // This pass is CPU-only (no network calls), so ranking up front costs nothing the single-loop
    // version wasn't already going to spend.
    const rankedCandidates = [];

    for (const seeker of candidates) {
      // Re-checked per candidate rather than trusted from the search filter: when Atlas rejects
      // the $vectorSearch filter (the opt-in path may not be a declared filter field in the
      // vector index), findCandidatesForJob silently falls back to a text query, and an
      // un-enforced opt-in here would mean messaging someone who never consented.
      if (!seeker.isPro) {
        incrementReason(runLog.skippedReasons, "notPro");
        continue;
      }

      if (!seeker.autoApplyPreferences?.autoIntroduceToRecruiters) {
        incrementReason(runLog.skippedReasons, "introductionsNotOptedIn");
        continue;
      }

      const channels = resolveIntroductionChannels(seeker);

      // Master switch on but both channels off authorizes nothing to actually happen. Skipped with
      // its own reason rather than folded into introductionsNotOptedIn, because the two states need
      // to stay distinguishable when someone asks why a run produced no introductions.
      if (!channels.connect && !channels.dm) {
        incrementReason(runLog.skippedReasons, "noIntroductionChannelEnabled");
        continue;
      }

      if (!channels.connect) {
        incrementReason(runLog.skippedReasons, "dmRequiresAutoConnect");
        continue;
      }

      if (alreadyIntroducedIds.has(seeker._id.toString())) {
        incrementReason(runLog.skippedReasons, "alreadyIntroduced");
        continue;
      }

      if ((seeker.recruiterIntroCountToday || 0) >= introPolicy.maxDailyIntroductionsPerSeeker) {
        incrementReason(runLog.skippedReasons, "seekerDailyCapReached");
        continue;
      }

      if (seeker.autoApplyPreferences?.safetyGuardrailsEnabled) {
        if (!hasLocationMatch(seeker, job)) {
          incrementReason(runLog.skippedReasons, "locationMismatch");
          continue;
        }

        if (!hasSalaryMatch(seeker, job)) {
          incrementReason(runLog.skippedReasons, "salaryMismatch");
          continue;
        }

        if (isExcludedCompany(seeker, job, organization)) {
          incrementReason(runLog.skippedReasons, "companyExcluded");
          continue;
        }
      }

      const vectorScore = computePairVectorScore(seeker, job, runLog.warnings);
      const match = computeAutoApplyCompositeMatch(seeker, job, { vectorScore });

      if (match.score < threshold) {
        incrementReason(runLog.skippedReasons, "belowThreshold");
        continue;
      }

      rankedCandidates.push({ seeker, match, channels });
    }

    rankedCandidates.sort((a, b) => b.match.score - a.match.score);

    for (const { seeker, match, channels } of rankedCandidates) {
      if (recruiterBudget <= 0) {
        incrementReason(runLog.skippedReasons, "recruiter_rate_limited");
        break;
      }

      const slotReservation = await reserveIntroductionSlot(
        seeker._id,
        introPolicy.maxDailyIntroductionsPerSeeker
      );

      if (!slotReservation) {
        incrementReason(runLog.skippedReasons, "seekerDailyCapReached");
        continue;
      }

      const matchedSkills = getTopMatchedSkills(match);
      let content = null;

      // The AI call only happens when the seeker actually authorized a message. Skipping it for
      // connection-only seekers isn't just a cost saving: generating text nobody consented to send
      // and then discarding it is work this feature has no reason to do.
      if (channels.dm) {
        let draftedMessage = null;

        try {
          draftedMessage = await generateRecruiterDm(
            buildProfileForTailoring(toPlainSeeker(seeker)),
            buildIntroductionContext({
              job,
              organization,
              hrMember,
              matchedSkills,
              matchScore: match.score
            })
          );
        } catch (error) {
          runLog.warnings.push(
            `Introduction draft failed for seeker ${seeker._id}: ${error.message}`
          );
        }

        // No template fallback on purpose. A generic "I saw your posting and think I'd be a great
        // fit" note sent under a real person's name is exactly the spam this feature must not
        // produce — if the model can't ground a message in this candidate's actual profile, the
        // right outcome is silence.
        //
        // Degrading to connection-only rather than skipping outright: this seeker separately
        // consented to being connected, and that consent is still honourable when only the drafting
        // failed. TRADEOFF: the unique (seeker, hrMember, job) index means this pairing can never
        // be retried later with a message, so a drafting outage converts those introductions to
        // connections permanently — recorded as its own reason so that shows up in the run log
        // instead of looking like a clean success.
        if (draftedMessage && String(draftedMessage).trim()) {
          content = String(draftedMessage).trim();
        } else {
          incrementReason(runLog.skippedReasons, "messageGenerationFailed_connectedOnly");
        }
      }

      let introduction = null;

      try {
        // Written before anything is delivered so the unique (seeker, hrMember, job) index — not
        // the in-memory pre-check above — is what arbitrates concurrent runs of the same job.
        introduction = await RecruiterIntroduction.create({
          jobSeekerId: seeker._id,
          hrMemberId: hrMember._id,
          organizationId: job.organizationId,
          jobId: job._id,
          matchScore: match.score,
          matchTag: match.tag,
          matchedSkills,
          deliveryMode: content ? "connection_and_message" : "connection_only",
          generatedBy: content ? "ai_auto" : "system_auto",
          ...(content ? { message: content } : {})
        });
      } catch (error) {
        await releaseIntroductionSlot(seeker._id);

        if (error.code === 11000) {
          incrementReason(runLog.skippedReasons, "alreadyIntroduced");
          continue;
        }

        runLog.errors.push(error.message);
        continue;
      }

      try {
        const session = await establishIntroductionConnection({ seeker, job });

        if (!session) {
          // The chat session should always exist by now (ensureRecruiterNetwork just upserted
          // it); if it somehow doesn't, the introduction row stays undelivered rather than being
          // retried into a duplicate message later.
          runLog.errors.push(
            `Chat session missing for seeker ${seeker._id} — introduction recorded but not delivered.`
          );
          continue;
        }

        const delivery = content
          ? await deliverIntroductionMessage({
              seeker,
              job,
              hrMember,
              introduction,
              content,
              session
            })
          : null;

        introduction.chatSessionId = session._id;
        // For a connection-only record there is no message, so deliveredAt marks when the
        // connection itself was established — the introduction is complete either way, and leaving
        // it unset would make delivered and failed records indistinguishable.
        introduction.deliveredAt = delivery ? delivery.message.createdAt : new Date();

        if (delivery) {
          introduction.chatMessageId = delivery.message._id;
        }

        await introduction.save();

        const hrName = getMemberDisplayName(hrMember);
        const companyName = organization?.companyName || "the company";
        // Copy has to tell the truth about which of the two things actually happened — a seeker who
        // turned auto-DM off must never be told a message was sent in their name.
        const seekerNotificationMessage = delivery
          ? `We introduced you to ${hrName} at ${companyName} for ${job.title}. The message is in your chat.`
          : `We connected you with ${hrName} at ${companyName} for ${job.title}. No message was sent — you can start the conversation in chat.`;
        const organizationNotificationMessage = delivery
          ? `${seeker.firstName} ${seeker.lastName} was introduced to ${hrName} for ${job.title} (${match.score}% match).`
          : `${seeker.firstName} ${seeker.lastName} connected with ${hrName} for ${job.title} (${match.score}% match).`;
        const sharedMetadata = {
          introductionId: introduction._id,
          jobId: job._id,
          hrMemberId: hrMember._id,
          sessionId: session._id,
          deliveryMode: introduction.deliveryMode,
          ...(delivery ? { messageId: delivery.message._id } : {}),
          aiAssisted: Boolean(delivery),
          autoSent: Boolean(delivery)
        };

        await Promise.all([
          createNotification({
            recipientId: seeker._id,
            recipientRole: "seeker",
            type: "recruiter_introduction_sent",
            title: delivery ? "We introduced you to a recruiter" : "We connected you with a recruiter",
            message: seekerNotificationMessage,
            metadata: {
              ...sharedMetadata,
              organizationId: job.organizationId
            }
          }),
          // Notifications are addressed to the organization because Notification.recipientRole
          // has no member-level role and req.user.id stays the Organization id everywhere —
          // hrMemberId in the metadata carries the individual attribution instead.
          createNotification({
            recipientId: job.organizationId,
            recipientRole: "organization",
            type: "recruiter_introduction_received",
            title: delivery ? "New candidate introduction" : "New candidate connection",
            message: organizationNotificationMessage,
            metadata: {
              ...sharedMetadata,
              jobSeekerId: seeker._id,
              matchScore: match.score
            }
          })
        ]);

        runLog.introductionsCreated += 1;
        runLog.introducedSeekerIds.push(seeker._id);
        recruiterBudget -= 1;
      } catch (error) {
        runLog.errors.push(
          `Introduction delivery failed for seeker ${seeker._id}: ${error.message}`
        );
      }
    }

    await RecruiterIntroductionRun.create(runLog);
    return runLog;
  } catch (error) {
    runLog.errors.push(error.message);
    await RecruiterIntroductionRun.create(runLog).catch(() => null);
    return runLog;
  }
}

module.exports = {
  INTRODUCTION_CANDIDATE_FILTER,
  runRecruiterIntroductionsForJob
};
