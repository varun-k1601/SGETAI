const PlatformSetting = require("../models/PlatformSetting");

const PLATFORM_POLICY_KEY = "platform_policy";
const DEFAULT_PRO_AUTO_APPLY_POLICY = {
  enabled: true,
  matchThreshold: 70,
  maxDailyApplications: 10
};
// Intentionally low — see the comment on proRecruiterIntroPolicySchema in PlatformSetting.js.
// The match threshold is NOT duplicated here: introductions reuse whatever gate auto-apply
// already resolves for the job (job.autoApplyThreshold ?? proAutoApplyPolicy.matchThreshold),
// so the two features can never disagree about who "clears the bar" for the same posting.
const DEFAULT_PRO_RECRUITER_INTRO_POLICY = {
  enabled: true,
  maxIntroductionsPerJobPerRecruiter: 3,
  maxIntroductionsPerRecruiterPerDay: 10,
  maxDailyIntroductionsPerSeeker: 3
};

async function getPlatformSettings() {
  return PlatformSetting.findOneAndUpdate(
    { key: PLATFORM_POLICY_KEY },
    {
      $setOnInsert: {
        key: PLATFORM_POLICY_KEY,
        proAutoApplyPolicy: DEFAULT_PRO_AUTO_APPLY_POLICY
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

async function getProAutoApplyPolicy() {
  const settings = await getPlatformSettings();
  return {
    enabled:
      settings.proAutoApplyPolicy?.enabled ??
      DEFAULT_PRO_AUTO_APPLY_POLICY.enabled,
    matchThreshold:
      settings.proAutoApplyPolicy?.matchThreshold ??
      DEFAULT_PRO_AUTO_APPLY_POLICY.matchThreshold,
    maxDailyApplications:
      settings.proAutoApplyPolicy?.maxDailyApplications ??
      DEFAULT_PRO_AUTO_APPLY_POLICY.maxDailyApplications
  };
}

// Four hours. Deliberately not zero-ish: an unreachable target would report every ticket as an
// SLA breach on day one, which reads as a broken metric rather than a demanding one.
const DEFAULT_SUPPORT_POLICY = {
  slaTargetMinutes: 240
};

async function getSupportPolicy() {
  const settings = await getPlatformSettings();
  return {
    slaTargetMinutes:
      settings.supportPolicy?.slaTargetMinutes ?? DEFAULT_SUPPORT_POLICY.slaTargetMinutes
  };
}

async function getProRecruiterIntroPolicy() {
  const settings = await getPlatformSettings();
  return {
    enabled:
      settings.proRecruiterIntroPolicy?.enabled ??
      DEFAULT_PRO_RECRUITER_INTRO_POLICY.enabled,
    maxIntroductionsPerJobPerRecruiter:
      settings.proRecruiterIntroPolicy?.maxIntroductionsPerJobPerRecruiter ??
      DEFAULT_PRO_RECRUITER_INTRO_POLICY.maxIntroductionsPerJobPerRecruiter,
    maxIntroductionsPerRecruiterPerDay:
      settings.proRecruiterIntroPolicy?.maxIntroductionsPerRecruiterPerDay ??
      DEFAULT_PRO_RECRUITER_INTRO_POLICY.maxIntroductionsPerRecruiterPerDay,
    maxDailyIntroductionsPerSeeker:
      settings.proRecruiterIntroPolicy?.maxDailyIntroductionsPerSeeker ??
      DEFAULT_PRO_RECRUITER_INTRO_POLICY.maxDailyIntroductionsPerSeeker
  };
}

async function updateProAutoApplyPolicy({ enabled, matchThreshold, maxDailyApplications, updatedBy }) {
  const currentSettings = await getPlatformSettings();
  const nextPolicy = {
    enabled:
      enabled !== undefined
        ? Boolean(enabled)
        : currentSettings.proAutoApplyPolicy?.enabled ?? DEFAULT_PRO_AUTO_APPLY_POLICY.enabled,
    matchThreshold,
    maxDailyApplications,
    updatedBy,
    updatedAt: new Date()
  };

  const settings = await PlatformSetting.findOneAndUpdate(
    { key: PLATFORM_POLICY_KEY },
    {
      $set: {
        proAutoApplyPolicy: nextPolicy
      },
      $setOnInsert: {
        key: PLATFORM_POLICY_KEY
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return settings.proAutoApplyPolicy;
}

async function updateProRecruiterIntroPolicy({
  enabled,
  maxIntroductionsPerJobPerRecruiter,
  maxIntroductionsPerRecruiterPerDay,
  maxDailyIntroductionsPerSeeker,
  updatedBy
}) {
  const currentPolicy = await getProRecruiterIntroPolicy();
  // Each cap falls back to the CURRENT value rather than the hardcoded default when omitted, so a
  // partial update can never silently re-loosen a limit an admin previously tightened.
  const nextPolicy = {
    enabled: enabled !== undefined ? Boolean(enabled) : currentPolicy.enabled,
    maxIntroductionsPerJobPerRecruiter:
      maxIntroductionsPerJobPerRecruiter !== undefined
        ? maxIntroductionsPerJobPerRecruiter
        : currentPolicy.maxIntroductionsPerJobPerRecruiter,
    maxIntroductionsPerRecruiterPerDay:
      maxIntroductionsPerRecruiterPerDay !== undefined
        ? maxIntroductionsPerRecruiterPerDay
        : currentPolicy.maxIntroductionsPerRecruiterPerDay,
    maxDailyIntroductionsPerSeeker:
      maxDailyIntroductionsPerSeeker !== undefined
        ? maxDailyIntroductionsPerSeeker
        : currentPolicy.maxDailyIntroductionsPerSeeker,
    updatedBy,
    updatedAt: new Date()
  };

  const settings = await PlatformSetting.findOneAndUpdate(
    { key: PLATFORM_POLICY_KEY },
    {
      $set: {
        proRecruiterIntroPolicy: nextPolicy
      },
      $setOnInsert: {
        key: PLATFORM_POLICY_KEY
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return settings.proRecruiterIntroPolicy;
}

module.exports = {
  DEFAULT_PRO_AUTO_APPLY_POLICY,
  DEFAULT_PRO_RECRUITER_INTRO_POLICY,
  DEFAULT_SUPPORT_POLICY,
  getPlatformSettings,
  getProAutoApplyPolicy,
  getProRecruiterIntroPolicy,
  getSupportPolicy,
  updateProAutoApplyPolicy,
  updateProRecruiterIntroPolicy
};
