function sanitizeSeekerProfile(seeker, options = {}) {
  const {
    includePrivate = false
  } = options;

  const profile = seeker.toObject ? seeker.toObject() : { ...seeker };

  delete profile.embedding;
  delete profile.hiddenRoles;
  delete profile.__v;

  if (!includePrivate) {
    delete profile.phone;
    delete profile.autoApplyPreferences;
    delete profile.autoApplyCountToday;
    delete profile.resumesGeneratedToday;
    delete profile.lastResumeResetDate;
  }

  return profile;
}

function sanitizeOrganizationProfile(organization, options = {}) {
  const { includeRepresentativeDetails = false } = options;
  const profile = organization.toObject ? organization.toObject() : { ...organization };

  delete profile.__v;

  if (!includeRepresentativeDetails) {
    delete profile.representativeDetails;
  }

  return profile;
}

module.exports = {
  sanitizeSeekerProfile,
  sanitizeOrganizationProfile
};
