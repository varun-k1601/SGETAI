const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { domainCheck, isCorporateEmailDomain } = require("../utils/domainCheck");
const { createAccessToken, createRefreshToken } = require("../utils/jwt");
const { fireAndForget, syncSeekerAiFields } = require("../services/aiSyncService");
const {
  requireNonEmptyString,
  requireArrayOfStrings,
  optionalString
} = require("../utils/validation");

const Admin = require("../models/Admin");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");

const roleModelMap = {
  seeker: JobSeeker,
  organization: Organization
};

const oauthProviders = {
  google: {
    label: "Google",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile"
  },
  microsoft: {
    label: "Microsoft",
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    redirectUriEnv: "MICROSOFT_OAUTH_REDIRECT_URI",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile User.Read"
  },
  // Identity-linking only (see proFeaturesController.js's LinkedIn connect/callback handlers) —
  // NOT used as a login provider. Scope is intentionally limited to OpenID identity; LinkedIn's
  // public API does not grant connection/messaging permissions to apps outside its vetted
  // Talent/Marketing Partner program, so no w_member_social or similar scope is requested here.
  linkedin: {
    label: "LinkedIn",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    redirectUriEnv: "LINKEDIN_REDIRECT_URI",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email"
  }
};

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function getFrontendUrl() {
  const configuredUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

  if (
    process.env.NODE_ENV !== "production" &&
    configuredUrl === "http://localhost:3000"
  ) {
    return "http://localhost:5173";
  }

  return configuredUrl;
}

function getApiOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getOAuthRedirectUri(req, providerKey) {
  const provider = oauthProviders[providerKey];
  return (
    process.env[provider.redirectUriEnv] ||
    `${getApiOrigin(req)}/api/auth/oauth/${providerKey}/callback`
  );
}

function getOAuthProviderConfig(req, providerKey) {
  const provider = oauthProviders[providerKey];

  if (!provider) {
    throw new ApiError(400, "Supported OAuth providers are google or microsoft.");
  }

  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];

  if (!clientId || !clientSecret) {
    throw new ApiError(503, `${provider.label} sign-in is not configured yet.`);
  }

  return {
    ...provider,
    providerKey,
    clientId,
    clientSecret,
    redirectUri: getOAuthRedirectUri(req, providerKey)
  };
}

function redirectToLoginWithOAuthError(res, message) {
  const params = new URLSearchParams({ oauthError: message });
  return res.redirect(`${getFrontendUrl()}/login?${params.toString()}`);
}

function redirectToOAuthCallback(res, authResponse, options = {}) {
  const params = new URLSearchParams({
    accessToken: authResponse.accessToken,
    refreshToken: authResponse.refreshToken,
    role: authResponse.role,
    userId: String(authResponse.userId),
    email: authResponse.email || "",
    username: authResponse.username || "",
    isNewOAuthUser: options.isNewOAuthUser ? "true" : "false"
  });

  return res.redirect(`${getFrontendUrl()}/oauth/callback#${params.toString()}`);
}

function redirectToOAuthOrganizationCompletion(res, profile) {
  const completionToken = jwt.sign(
    {
      type: "oauth-organization-completion",
      profile
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const params = new URLSearchParams({ token: completionToken });

  return res.redirect(`${getFrontendUrl()}/oauth/complete-recruiter#${params.toString()}`);
}

function normalizeOAuthProfile(providerKey, profile) {
  const email = normalizeEmail(
    profile.email ||
      profile.preferred_username ||
      profile.upn ||
      profile.userPrincipalName
  );
  const name = String(profile.name || profile.displayName || email.split("@")[0] || "").trim();
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = String(profile.given_name || nameParts[0] || "SGETAI").trim();
  const lastName = String(profile.family_name || nameParts.slice(1).join(" ") || "User").trim();

  return {
    provider: providerKey,
    providerId: String(profile.sub || profile.id || profile.oid || ""),
    email,
    firstName,
    lastName,
    name
  };
}

function buildUsernameBase(profile) {
  const source = profile.email?.split("@")[0] || profile.name || "sgetaiuser";
  const base = normalizeUsername(source).replace(/[^a-z0-9._-]/g, "").slice(0, 24);
  return base.length >= 3 ? base : `user${base}`;
}

async function generateUniqueUsername(profile) {
  const base = buildUsernameBase(profile);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? "" : String(attempt + 1);
    const candidate = `${base}${suffix}`.slice(0, 30);
    const existingUser = await findExistingUserByUsername(candidate);

    if (!existingUser) {
      return candidate;
    }
  }

  return `user${Date.now()}`.slice(0, 30);
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }

  return value;
}

function optionalStringOrExisting(value, existingValue) {
  const normalized = optionalString(value);
  return normalized !== undefined ? normalized : existingValue;
}

function buildAuthPayload(user, role) {
  return {
    id: user._id.toString(),
    role,
    email: user.email,
    username: user.username
  };
}

function buildAuthResponse(user, role) {
  const payload = buildAuthPayload(user, role);

  return {
    accessToken: createAccessToken(payload),
    refreshToken: createRefreshToken(payload),
    role,
    userId: user._id,
    email: user.email,
    username: user.username
  };
}

async function findExistingUserByEmail(email) {
  const [jobSeeker, organization] = await Promise.all([
    JobSeeker.findOne({ email }),
    Organization.findOne({ email })
  ]);

  if (jobSeeker) {
    return { role: "seeker", user: jobSeeker };
  }

  if (organization) {
    return { role: "organization", user: organization };
  }

  return null;
}

async function findExistingUserByEmailWithPassword(email) {
  const [jobSeeker, organization] = await Promise.all([
    JobSeeker.findOne({ email }).select("+passwordHash"),
    Organization.findOne({ email }).select("+passwordHash")
  ]);

  if (jobSeeker) {
    return { role: "seeker", user: jobSeeker };
  }

  if (organization) {
    return { role: "organization", user: organization };
  }

  return null;
}

async function findExistingUserByUsername(username) {
  const [jobSeeker, organization] = await Promise.all([
    JobSeeker.findOne({ username }),
    Organization.findOne({ username })
  ]);

  if (jobSeeker) {
    return { role: "seeker", user: jobSeeker };
  }

  if (organization) {
    return { role: "organization", user: organization };
  }

  return null;
}

async function findExistingUserByLogin(identifier) {
  const value = String(identifier || "").trim().toLowerCase();

  if (!value) {
    return null;
  }

  const query = value.includes("@")
    ? { email: value }
    : { username: normalizeUsername(value) };

  const [jobSeeker, organization] = await Promise.all([
    JobSeeker.findOne(query).select("+passwordHash"),
    Organization.findOne(query).select("+passwordHash")
  ]);

  if (jobSeeker) {
    return { role: "seeker", user: jobSeeker };
  }

  if (organization) {
    return { role: "organization", user: organization };
  }

  return null;
}

async function assertAuthIdentityAvailable(email, username) {
  const [existingEmail, existingUsername] = await Promise.all([
    findExistingUserByEmail(email),
    findExistingUserByUsername(username)
  ]);

  if (existingEmail) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  if (existingUsername) {
    throw new ApiError(409, "This username is already taken.");
  }
}

async function getExistingIdentityForRegistration(email, username) {
  const [existingEmail, existingUsername] = await Promise.all([
    findExistingUserByEmailWithPassword(email),
    findExistingUserByUsername(username)
  ]);

  if (
    existingUsername &&
    (!existingEmail || existingUsername.user._id.toString() !== existingEmail.user._id.toString())
  ) {
    throw new ApiError(409, "This username is already taken.");
  }

  return existingEmail;
}

async function findClaimableLegacyUser(email, username, role) {
  const existingEmail = await getExistingIdentityForRegistration(email, username);

  if (!existingEmail) {
    return null;
  }

  if (existingEmail.role !== role) {
    throw new ApiError(409, "An account with this email already exists for a different role.");
  }

  if (existingEmail.user.passwordHash) {
    throw new ApiError(409, "An account with this email already exists. Please sign in instead.");
  }

  return existingEmail.user;
}

async function registerWithRole(req, res, role) {
  const Model = roleModelMap[role];

  if (!Model) {
    throw new ApiError(400, "Supported roles are seeker or organization.");
  }

  const email = normalizeEmail(req.body.email);
  const username = normalizeUsername(req.body.username);
  const password = validatePassword(req.body.password);
  const confirmPassword = String(req.body.confirmPassword || req.body.passwordConfirm || req.body.password || "");

  if (!email || !username) {
    throw new ApiError(400, "Email and username are required.");
  }

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new ApiError(400, "Username must be 3-30 characters and can use letters, numbers, dots, underscores, or hyphens.");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "Password and confirm password do not match.");
  }

  if (role === "organization" && !isCorporateEmailDomain(email)) {
    throw new ApiError(400, "Organization registration requires a corporate email domain.");
  }

  let user;
  const legacyUser = await findClaimableLegacyUser(email, username, role);
  const passwordHash = await bcrypt.hash(password, 10);

  if (role === "seeker") {
    if (!req.body.firstName || !req.body.lastName) {
      throw new ApiError(400, "firstName and lastName are required for seekers.");
    }

    const seekerPayload = {
      firstName: requireNonEmptyString(req.body.firstName, "firstName"),
      lastName: requireNonEmptyString(req.body.lastName, "lastName"),
      username,
      email,
      passwordHash,
      phone: optionalStringOrExisting(req.body.phone, legacyUser?.phone),
      currentStatus: req.body.currentStatus || legacyUser?.currentStatus,
      universityName: optionalStringOrExisting(req.body.universityName, legacyUser?.universityName),
      degree: optionalStringOrExisting(req.body.degree, legacyUser?.degree),
      major: optionalStringOrExisting(req.body.major, legacyUser?.major),
      skills: req.body.skills
        ? requireArrayOfStrings(req.body.skills, "skills", { max: 50 })
        : legacyUser?.skills || [],
      preferredRoles: req.body.preferredRoles
        ? requireArrayOfStrings(req.body.preferredRoles, "preferredRoles", { max: 20 })
        : legacyUser?.preferredRoles || [],
      openToWork:
        req.body.openToWork !== undefined
          ? Boolean(req.body.openToWork)
          : Boolean(legacyUser?.openToWork)
    };

    if (legacyUser) {
      Object.assign(legacyUser, seekerPayload);
      user = await legacyUser.save();
    } else {
      user = await JobSeeker.create(seekerPayload);
    }

    fireAndForget(() => syncSeekerAiFields(user._id));
  }

  if (role === "organization") {
    if (!req.body.companyName || !req.body.websiteUrl) {
      throw new ApiError(400, "companyName and websiteUrl are required for organizations.");
    }

    const domainMatched = domainCheck(email, req.body.websiteUrl);
    const verificationStatus = domainMatched ? "Verified" : "OnHold";

    const organizationPayload = {
      companyName: req.body.companyName,
      username,
      email,
      passwordHash,
      phone: optionalStringOrExisting(req.body.phone, legacyUser?.phone),
      industry: optionalStringOrExisting(req.body.industry, legacyUser?.industry),
      companySize: optionalStringOrExisting(req.body.companySize, legacyUser?.companySize),
      websiteUrl: optionalStringOrExisting(req.body.websiteUrl, legacyUser?.websiteUrl),
      linkedinPage: optionalStringOrExisting(req.body.linkedinPage, legacyUser?.linkedinPage),
      description: optionalStringOrExisting(req.body.description, legacyUser?.description),
      headquartersLocation: optionalStringOrExisting(
        req.body.headquartersLocation,
        legacyUser?.headquartersLocation
      ),
      foundedYear: req.body.foundedYear || legacyUser?.foundedYear,
      domainMatched,
      verificationStatus,
      representativeDetails: req.body.representativeDetails || legacyUser?.representativeDetails
    };

    if (legacyUser) {
      Object.assign(legacyUser, organizationPayload);
      user = await legacyUser.save();
    } else {
      user = await Organization.create(organizationPayload);
    }

    if (!domainMatched) {
      return sendSuccess(
        res,
        {
          message:
            "Organization registered, but the account is on hold because the email domain does not match the website domain.",
          role,
          userId: user._id,
          verificationStatus: user.verificationStatus
        },
        201
      );
    }
  }

  return sendSuccess(
    res,
    {
      message: "Registration successful.",
      ...buildAuthResponse(user, role)
    },
    201
  );
}

const register = asyncHandler(async (req, res) => {
  const role = (req.params.role || "").trim().toLowerCase();

  return registerWithRole(req, res, role);
});

const registerOrganization = asyncHandler(async (req, res) => {
  return registerWithRole(req, res, "organization");
});

const login = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || req.body.username || req.body.email || "").trim();
  const password = String(req.body.password || "");

  if (!identifier || !password) {
    throw new ApiError(400, "Username/email and password are required.");
  }

  const existingUser = await findExistingUserByLogin(identifier);

  if (!existingUser) {
    throw new ApiError(401, "Invalid login credentials.");
  }

  if (
    existingUser.role === "organization" &&
    existingUser.user.verificationStatus === "OnHold"
  ) {
    throw new ApiError(403, "Organization account is on hold pending domain review.");
  }

  if (!existingUser.user.passwordHash) {
    throw new ApiError(401, "Password login is not enabled for this account. Please register again with username and password.");
  }

  const passwordMatches = await bcrypt.compare(password, existingUser.user.passwordHash);

  if (!passwordMatches) {
    throw new ApiError(401, "Invalid login credentials.");
  }

  return sendSuccess(res, {
    message: "Login successful.",
    ...buildAuthResponse(existingUser.user, existingUser.role)
  });
});

const startOAuth = asyncHandler(async (req, res) => {
  const providerKey = String(req.params.provider || "").trim().toLowerCase();

  try {
    const provider = getOAuthProviderConfig(req, providerKey);
    const requestedRole = String(req.query.role || "seeker").trim().toLowerCase();
    const role = requestedRole === "organization" ? "organization" : "seeker";
    const state = jwt.sign(
      {
        provider: providerKey,
        role,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: "code",
      scope: provider.scope,
      state,
      prompt: "select_account"
    });

    return res.redirect(`${provider.authorizeUrl}?${params.toString()}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return redirectToLoginWithOAuthError(res, error.message);
    }

    throw error;
  }
});

async function exchangeOAuthCode(provider, code) {
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: provider.redirectUri
    })
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new ApiError(401, tokenPayload.error_description || "OAuth token exchange failed.");
  }

  return tokenPayload;
}

async function fetchOAuthProfile(provider, tokenPayload) {
  const profileResponse = await fetch(provider.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });
  const profilePayload = await profileResponse.json().catch(() => ({}));

  if (!profileResponse.ok) {
    throw new ApiError(401, "Unable to fetch OAuth profile.");
  }

  return normalizeOAuthProfile(provider.providerKey, profilePayload);
}

async function findOrCreateOAuthUser(profile, requestedRole) {
  if (!profile.email) {
    throw new ApiError(400, "OAuth account did not provide an email address.");
  }

  const existingUser = await findExistingUserByEmailWithPassword(profile.email);

  if (existingUser) {
    if (
      existingUser.role === "organization" &&
      existingUser.user.verificationStatus === "OnHold"
    ) {
      throw new ApiError(403, "Organization account is on hold pending domain review.");
    }

    if (!existingUser.user.username) {
      existingUser.user.username = await generateUniqueUsername(profile);
      await existingUser.user.save();
    }

    return { ...existingUser, isNewOAuthUser: false };
  }

  if (requestedRole === "organization") {
    throw new ApiError(
      400,
      "Please create a recruiter account first, then use social sign-in with the same email."
    );
  }

  const user = await JobSeeker.create({
    firstName: profile.firstName,
    lastName: profile.lastName,
    username: await generateUniqueUsername(profile),
    email: profile.email,
    currentStatus: "Professional",
    openToWork: true
  });

  fireAndForget(() => syncSeekerAiFields(user._id));
  return { role: "seeker", user, isNewOAuthUser: true };
}

const completeOAuthOrganization = asyncHandler(async (req, res) => {
  const token = String(req.body.token || "");

  if (!token) {
    throw new ApiError(400, "OAuth completion token is required.");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "OAuth completion token is invalid or expired.");
  }

  if (decodedToken.type !== "oauth-organization-completion" || !decodedToken.profile?.email) {
    throw new ApiError(400, "OAuth completion token is not valid for recruiter signup.");
  }

  const profile = decodedToken.profile;
  const email = normalizeEmail(profile.email);

  if (!isCorporateEmailDomain(email)) {
    throw new ApiError(400, "Recruiter social signup requires a corporate email address.");
  }

  const existingUser = await findExistingUserByEmailWithPassword(email);

  if (existingUser) {
    if (
      existingUser.role === "organization" &&
      existingUser.user.verificationStatus === "OnHold"
    ) {
      throw new ApiError(403, "Organization account is on hold pending domain review.");
    }

    return sendSuccess(res, {
      message: "Account already exists. Signed in successfully.",
      ...buildAuthResponse(existingUser.user, existingUser.role)
    });
  }

  const companyName = requireNonEmptyString(req.body.companyName, "companyName");
  const websiteUrl = requireNonEmptyString(req.body.websiteUrl, "websiteUrl");
  const domainMatched = domainCheck(email, websiteUrl);
  const verificationStatus = domainMatched ? "Verified" : "OnHold";

  const user = await Organization.create({
    companyName,
    username: await generateUniqueUsername({
      email,
      name: companyName
    }),
    email,
    phone: optionalString(req.body.phone),
    industry: optionalString(req.body.industry),
    companySize: optionalString(req.body.companySize),
    websiteUrl,
    linkedinPage: optionalString(req.body.linkedinPage),
    description: optionalString(req.body.description),
    headquartersLocation: optionalString(req.body.headquartersLocation),
    domainMatched,
    verificationStatus,
    representativeDetails: {
      name: profile.name,
      email
    }
  });

  if (!domainMatched) {
    return sendSuccess(
      res,
      {
        message:
          "Recruiter account created, but it is on hold because the email domain does not match the website domain.",
        role: "organization",
        userId: user._id,
        verificationStatus: user.verificationStatus
      },
      201
    );
  }

  return sendSuccess(
    res,
    {
      message: "Recruiter account created successfully.",
      ...buildAuthResponse(user, "organization")
    },
    201
  );
});

const handleOAuthCallback = asyncHandler(async (req, res) => {
  const providerKey = String(req.params.provider || "").trim().toLowerCase();

  try {
    if (req.query.error) {
      throw new ApiError(401, String(req.query.error_description || req.query.error));
    }

    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!code || !state) {
      throw new ApiError(400, "OAuth callback is missing code or state.");
    }

    const decodedState = jwt.verify(state, process.env.JWT_SECRET);

    if (decodedState.provider !== providerKey) {
      throw new ApiError(400, "OAuth provider state mismatch.");
    }

    const provider = getOAuthProviderConfig(req, providerKey);
    const tokenPayload = await exchangeOAuthCode(provider, code);
    const profile = await fetchOAuthProfile(provider, tokenPayload);
    const existingIdentity = await findExistingUserByEmailWithPassword(profile.email);

    if (!existingIdentity && decodedState.role === "organization") {
      return redirectToOAuthOrganizationCompletion(res, profile);
    }

    const existingUser = await findOrCreateOAuthUser(profile, decodedState.role);

    return redirectToOAuthCallback(
      res,
      buildAuthResponse(existingUser.user, existingUser.role),
      { isNewOAuthUser: existingUser.isNewOAuthUser }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("OAuth callback failed:", {
        provider: providerKey,
        message: error.message,
        stack: error.stack
      });
    }

    const message = error instanceof ApiError
      ? error.message
      : process.env.NODE_ENV !== "production" && error.message
        ? error.message
        : "OAuth sign-in failed.";

    return redirectToLoginWithOAuthError(res, message);
  }
});

const adminLogin = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const admin = await Admin.findOne({ email });

  if (!admin) {
    throw new ApiError(401, "Invalid admin credentials.");
  }

  const passwordMatches = await bcrypt.compare(password, admin.passwordHash);

  if (!passwordMatches) {
    throw new ApiError(401, "Invalid admin credentials.");
  }

  const payload = {
    id: admin._id.toString(),
    role: admin.role,
    email: admin.email
  };

  return sendSuccess(res, {
    message: "Admin login successful.",
    accessToken: createAccessToken(payload),
    refreshToken: createRefreshToken(payload),
    role: admin.role,
    userId: admin._id
  });
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: "Authenticated user fetched successfully.",
    user: req.user
  });
});

module.exports = {
  register,
  registerOrganization,
  login,
  startOAuth,
  handleOAuthCallback,
  completeOAuthOrganization,
  adminLogin,
  me,
  // Reused by proFeaturesController.js for the LinkedIn identity-link flow.
  oauthProviders,
  exchangeOAuthCode
};
