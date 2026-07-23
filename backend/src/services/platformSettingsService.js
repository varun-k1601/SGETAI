const PlatformSetting = require("../models/PlatformSetting");

const PLATFORM_POLICY_KEY = "platform_policy";
const DEFAULT_PRO_AUTO_APPLY_POLICY = {
  enabled: true,
  matchThreshold: 70,
  maxDailyApplications: 10
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

module.exports = {
  DEFAULT_PRO_AUTO_APPLY_POLICY,
  getPlatformSettings,
  getProAutoApplyPolicy,
  updateProAutoApplyPolicy
};
