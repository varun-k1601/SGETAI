const freeEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com"
]);

function normalizeDomain(value) {
  if (!value) {
    return "";
  }

  const normalized = value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

  return normalized.split("/")[0];
}

function getEmailDomain(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  return normalizeDomain(email.split("@")[1]);
}

function isCorporateEmailDomain(email) {
  const emailDomain = getEmailDomain(email);

  if (!emailDomain) {
    return false;
  }

  return !freeEmailDomains.has(emailDomain);
}

function domainCheck(email, websiteUrl) {
  const emailDomain = getEmailDomain(email);
  const websiteDomain = normalizeDomain(websiteUrl);

  if (!emailDomain || !websiteDomain) {
    return false;
  }

  return emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`);
}

module.exports = {
  domainCheck,
  isCorporateEmailDomain,
  getEmailDomain,
  normalizeDomain
};
