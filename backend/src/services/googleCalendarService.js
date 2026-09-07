const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const OrganizationMember = require("../models/OrganizationMember");

/* ===============================================================================================
   GOOGLE CALENDAR — every call to Google lives in this file.
   ===============================================================================================
   The controller decides who may schedule what; this decides how to talk to Google. Nothing here
   knows about req/res, and no other module builds a Google request.

   SCOPE. calendar.events, and deliberately not calendar. calendar.events can create and manage
   events; the full calendar scope would also grant READ access to everything already on the
   recruiter's personal calendar — their doctor's appointments, their other employer's interviews.
   Asking for that to write one event is not a trade this app gets to make on their behalf.

   NOT THE LOGIN FLOW. authController's `google` provider is sign-in only and stays that way.
   Signing in must never ask for calendar access, so this uses its own client credentials read from
   the same env vars but its own redirect URI, its own scope, and its own consent screen — a
   recruiter who never schedules an interview is never asked for calendar permission at all.
   =============================================================================================== */

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
// Identity scopes so the card can name WHICH Google account is bound. These are the same two the
// login flow already uses; they add no calendar reach of their own.
const IDENTITY_SCOPES = ["openid", "email"];
const REQUESTED_SCOPES = [...IDENTITY_SCOPES, CALENDAR_SCOPE].join(" ");

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// A minute of slack, so a token that expires while the request is in flight is refreshed before
// the call rather than failing it.
const EXPIRY_SKEW_MS = 60 * 1000;

const STATE_PURPOSE = "google-calendar-connect";

const REDIRECT_URI_ENV = "GOOGLE_CALENDAR_REDIRECT_URI";
const REQUIRED_ENV_VARS = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  REDIRECT_URI_ENV
];

function missingConfig() {
  return REQUIRED_ENV_VARS.filter((key) => !String(process.env[key] || "").trim());
}

/* The redirect URI counts as configuration, not a credential: without it the flow cannot complete,
   so the card degrades to the same not-yet-available state as a missing client secret rather than
   offering a Connect button that dead-ends on Google's error page. */
function isConfigured() {
  return missingConfig().length === 0;
}

/* A SEPARATE redirect URI from the login callback, on purpose. Sharing one would mean Google's
   consent for calendar and for sign-in arriving at the same handler, and the only thing telling
   them apart would be a state param — a distinction worth having in the URL itself.

   AND NO FALLBACK. This used to guess `${req.protocol}://${req.get("host")}/api/...` when the
   variable was unset, which is wrong in precisely the environment where it is hardest to debug:
   server.js does not call app.set("trust proxy"), so behind the deployed Caddy -> nginx -> node
   chain req.protocol reports the internal hop as "http" while the registered URI is https, and
   req.get("host") reports whatever Host the proxy forwarded. Google answers redirect_uri_mismatch,
   an error whose text never says which value it rejected. Google matches this string character for
   character against the console entry, so it is read from configuration and nowhere else. */
function getRedirectUri() {
  const configured = String(process.env[REDIRECT_URI_ENV] || "").trim();

  if (!configured) {
    throw new ApiError(
      503,
      `Google Calendar is not configured on this server: ${REDIRECT_URI_ENV} is not set. It must ` +
        "hold the exact redirect URI registered on the Google OAuth client."
    );
  }

  return configured;
}

function getConfig() {
  const missing = missingConfig();

  if (missing.length > 0) {
    throw new ApiError(
      503,
      `Google Calendar is not configured on this server. Missing environment ${
        missing.length === 1 ? "variable" : "variables"
      }: ${missing.join(", ")}.`
    );
  }

  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: getRedirectUri()
  };
}

/* THE STATE PARAMETER. A callback that stores credentials and is reachable by anyone with the URL
   is a CSRF hole unless the state proves which member started the flow and that this app started
   it at all. Signed with JWT_SECRET (the same key the LinkedIn flow's state uses), carries a
   purpose so a token minted for anything else cannot be replayed here, carries the member and org
   the flow began for, and expires in ten minutes — long enough to sign in to Google, short enough
   that a leaked URL is dead by the time it is found. */
function buildState({ memberId, organizationId }) {
  return jwt.sign(
    {
      purpose: STATE_PURPOSE,
      memberId: String(memberId),
      organizationId: String(organizationId),
      nonce: crypto.randomBytes(12).toString("hex")
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
}

function verifyState(state) {
  let decoded;

  try {
    decoded = jwt.verify(String(state || ""), process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "This Google Calendar connection link is invalid or has expired.");
  }

  if (decoded.purpose !== STATE_PURPOSE || !decoded.memberId || !decoded.organizationId) {
    throw new ApiError(400, "Google Calendar connection state mismatch.");
  }

  return decoded;
}

function buildAuthorizeUrl({ memberId, organizationId }) {
  const config = getConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: REQUESTED_SCOPES,
    // access_type=offline AND prompt=consent, both required. Google issues a refresh token only on
    // the FIRST consent for a client/user pair unless prompt=consent forces the screen again — so
    // a member who disconnects and reconnects would otherwise come back with a one-hour access
    // token and no way to renew it, and the connection would die silently that afternoon.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: buildState({ memberId, organizationId })
  });

  /* Logged because redirect_uri_mismatch is the one Google error that will not tell you what it
     received — it reports only that the value did not match. This line turns hours of guessing
     into a string you can diff against the console entry. It carries no secret: the redirect URI
     is public by construction (the browser is about to send it to Google in a query string) and
     the member id is an ObjectId, not a credential. */
  console.log(
    `[GoogleCalendar] Starting connect for member ${memberId} with redirect_uri=${config.redirectUri}`
  );

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const payload = await response.json().catch(() => ({}));

  return { ok: response.ok, status: response.status, payload };
}

function parseGrantedScopes(payload) {
  return String(payload.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function exchangeCodeForTokens({ code }) {
  const config = getConfig();
  const { ok, payload } = await postForm(TOKEN_URL, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code"
  });

  if (!ok || !payload.access_token) {
    throw new ApiError(401, payload.error_description || "Google rejected the authorization code.");
  }

  const grantedScopes = parseGrantedScopes(payload);

  /* WHAT GOOGLE GRANTED, not what we asked for. The consent screen lets a member approve the
     identity scopes and decline calendar access, and the token exchange still succeeds — so a
     connection stored without checking would show "Connected" and fail on the first event. */
  if (!grantedScopes.includes(CALENDAR_SCOPE)) {
    throw new ApiError(
      403,
      "Calendar permission was not granted. Please approve access to your Google Calendar events to finish connecting."
    );
  }

  /* FAIL LOUDLY, rather than storing a connection that will die within the hour. This is the
     failure mode access_type=offline + prompt=consent exists to prevent, so if it happens anyway
     something is wrong with the request or the Google project — and the honest outcome is no
     connection and a message, not a badge that goes stale by tea time. */
  if (!payload.refresh_token) {
    throw new ApiError(
      502,
      "Google did not return a refresh token, so this connection would stop working within the hour. Remove SGETAI from your Google account permissions and connect again."
    );
  }

  return { payload, grantedScopes };
}

async function fetchGoogleIdentity(accessToken) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await response.json().catch(() => ({}));

  return response.ok ? profile : {};
}

// Reads the connection WITH its tokens. Everything else in the app reads a member without them —
// they are select:false — so this is the single place that asks.
async function loadConnection(memberId) {
  return OrganizationMember.findById(memberId).select(
    "+googleCalendarConnection.accessToken +googleCalendarConnection.refreshToken"
  );
}

function isLive(connection) {
  return Boolean(connection?.refreshToken && !connection.revokedAt);
}

/* Marks the connection dead in the database. Called when Google says invalid_grant, which is what
   a member revoking access from their Google security page looks like from in here: the app is
   never notified, the next refresh simply fails. Leaving the row untouched would leave the card
   claiming Connected forever — the exact class of lie the integrations page is built to avoid. */
async function markRevoked(member) {
  if (!member?.googleCalendarConnection) {
    return;
  }

  member.googleCalendarConnection.revokedAt = new Date();
  member.googleCalendarConnection.accessToken = undefined;
  member.googleCalendarConnection.refreshToken = undefined;
  await member.save();
}

/* Returns a usable access token, refreshing first when the stored one is expired or about to be.
   Google access tokens last about an hour; the refresh token is the long-lived credential, and it
   is the one that can be revoked out from under us. */
async function getAccessToken(member) {
  const connection = member?.googleCalendarConnection;

  if (!isLive(connection)) {
    throw new ApiError(400, "Connect your Google Calendar to schedule interviews.");
  }

  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;

  if (connection.accessToken && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return connection.accessToken;
  }

  const { ok, payload } = await postForm(TOKEN_URL, {
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token"
  });

  if (!ok || !payload.access_token) {
    if (payload.error === "invalid_grant") {
      await markRevoked(member);
      throw new ApiError(
        401,
        "Google Calendar access was revoked for this account. Reconnect it to schedule interviews."
      );
    }

    throw new ApiError(502, payload.error_description || "Could not refresh Google Calendar access.");
  }

  // Persist the new expiry, or the next call refreshes again on every request.
  connection.accessToken = payload.access_token;
  connection.expiresAt = new Date(Date.now() + Number(payload.expires_in || 3600) * 1000);

  if (payload.scope) {
    connection.scopes = parseGrantedScopes(payload);
  }

  await member.save();
  return payload.access_token;
}

async function callCalendar(member, path, { method = "GET", query = {}, body } = {}) {
  const accessToken = await getAccessToken(member);
  const search = new URLSearchParams(query).toString();
  const response = await fetch(`${CALENDAR_API}${path}${search ? `?${search}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return {};
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // A 401 here after a successful refresh means the grant died between the two calls.
    if (response.status === 401) {
      await markRevoked(member);
      throw new ApiError(401, "Google Calendar access was revoked. Reconnect it to continue.");
    }

    throw new ApiError(
      response.status === 403 ? 403 : 502,
      payload.error?.message || "Google Calendar rejected the request."
    );
  }

  return payload;
}

function buildEventBody({ title, description, startAt, endAt, timezone, attendeeEmail, requestId }) {
  return {
    summary: title,
    description,
    // Explicit IANA zone on both ends. Sending a bare local time leaves Google to guess, and the
    // guess is the calendar's zone, not the one the recruiter picked.
    start: { dateTime: new Date(startAt).toISOString(), timeZone: timezone },
    end: { dateTime: new Date(endAt).toISOString(), timeZone: timezone },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
    // Asking for the Meet link. Silently ignored unless conferenceDataVersion=1 is on the query
    // string — see the callers below, which is the only reason this is not a one-liner.
    conferenceData: requestId
      ? {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      : undefined,
    reminders: { useDefault: true }
  };
}

function readEvent(payload) {
  const entryPoint = (payload.conferenceData?.entryPoints || []).find(
    (entry) => entry.entryPointType === "video"
  );

  return {
    googleEventId: payload.id,
    meetLink: payload.hangoutLink || entryPoint?.uri || null,
    htmlLink: payload.htmlLink || null
  };
}

async function createEvent(member, { calendarId = "primary", ...event }) {
  const payload = await callCalendar(member, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    query: {
      // WITHOUT THIS the conferenceData block above is dropped on the floor: no Meet link, no
      // error, an event that looks fine until someone tries to join it.
      conferenceDataVersion: 1,
      sendUpdates: "all"
    },
    body: buildEventBody({ ...event, requestId: crypto.randomUUID() })
  });

  return readEvent(payload);
}

// PATCH, addressed by the stored googleEventId, so a reschedule moves the invite the candidate
// already has instead of sending them a second one.
async function updateEvent(member, { calendarId = "primary", googleEventId, ...event }) {
  const payload = await callCalendar(
    member,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      query: { conferenceDataVersion: 1, sendUpdates: "all" },
      // No conference createRequest on an update: the event already has its Meet link, and asking
      // for a new one would replace a link the candidate may already have in their calendar.
      body: buildEventBody({ ...event, requestId: null })
    }
  );

  return readEvent(payload);
}

async function cancelEvent(member, { calendarId = "primary", googleEventId }) {
  try {
    await callCalendar(
      member,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE", query: { sendUpdates: "all" } }
    );
  } catch (error) {
    /* A 404/410 means the event is already gone from Google — deleted by the recruiter in their
       own calendar, most likely. The in-app cancellation should still succeed: the desired end
       state (no event) already holds, and refusing would leave the app permanently unable to close
       a row whose event no longer exists. */
    if (error.statusCode === 404 || error.statusCode === 410) {
      return;
    }
    throw error;
  }
}

// Best-effort courtesy on disconnect: tells Google to drop the grant so it disappears from the
// member's own account permissions page too, rather than lingering as an app they thought they
// removed. Never fatal — the local tokens are cleared either way.
async function revokeToken(token) {
  if (!token) {
    return;
  }

  await postForm(REVOKE_URL, { token }).catch(() => null);
}

module.exports = {
  CALENDAR_SCOPE,
  isConfigured,
  buildAuthorizeUrl,
  verifyState,
  exchangeCodeForTokens,
  fetchGoogleIdentity,
  loadConnection,
  isLive,
  getAccessToken,
  markRevoked,
  createEvent,
  updateEvent,
  cancelEvent,
  revokeToken
};
