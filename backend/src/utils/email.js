const nodemailer = require("nodemailer");
const dns = require("dns");
const net = require("net");

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;
const IPV6_PROBE_TIMEOUT_MS = 2000;

function getConfiguredIpFamily() {
  const raw = (process.env.SMTP_IP_FAMILY || "").trim();
  return raw === "4" || raw === "6" ? Number(raw) : null;
}

function probeTcpConnect(host, family, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, family });

    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

// nodemailer resolves smtp.gmail.com's IPv4 (A) address itself and ignores any `family` option
// passed to createTransport when connecting by hostname (verified against its own DNS-resolution
// code, which always tries resolve4() first regardless of that option) — so the only way to
// actually force the connection over IPv6 is to hand it an already-resolved IPv6 literal as
// `host` (bypassing its resolver entirely) plus `servername` so TLS still validates the
// certificate against the real hostname. DNS resolution alone can't detect the ISP/router-level
// port blocking this was diagnosed against (IPv4 resolves fine; the IPv4 *connection* times out),
// so in auto mode we also probe a real TCP connect over IPv6 before committing to it.
async function resolveSmtpConnectionOptions() {
  const forcedFamily = getConfiguredIpFamily();

  if (forcedFamily === 4) {
    return { host: SMTP_HOST };
  }

  if (forcedFamily === 6) {
    const [address] = await dns.promises.resolve6(SMTP_HOST);
    return { host: address, servername: SMTP_HOST };
  }

  try {
    const [address] = await dns.promises.resolve6(SMTP_HOST);
    const reachable = await probeTcpConnect(address, 6, SMTP_PORT, IPV6_PROBE_TIMEOUT_MS);

    if (reachable) {
      return { host: address, servername: SMTP_HOST };
    }
  } catch (error) {
    // No AAAA record, or IPv6 unreachable/unavailable on this network — fall through to the
    // default hostname (nodemailer's own resolver, which prefers IPv4).
  }

  return { host: SMTP_HOST };
}

function getNormalizedEmailConfig() {
  const emailUser = (process.env.EMAIL_USER || "").trim();
  const emailPass = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");

  return { emailUser, emailPass };
}

function shouldUseDevEmailFallback() {
  const { emailUser, emailPass } = getNormalizedEmailConfig();

  return (
    process.env.NODE_ENV !== "production" &&
    (!emailUser ||
      emailUser.includes("your_email") ||
      !emailPass ||
      emailPass.includes("replace_me"))
  );
}

async function buildTransport() {
  const { emailUser, emailPass } = getNormalizedEmailConfig();

  if (shouldUseDevEmailFallback()) {
    return nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }

  const connectionOptions = await resolveSmtpConnectionOptions();

  return nodemailer.createTransport({
    ...connectionOptions,
    port: SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

async function sendEmail(to, subject, html) {
  const { emailUser } = getNormalizedEmailConfig();
  const transporter = await buildTransport();
  const info = await transporter.sendMail({
    from: emailUser,
    to,
    subject,
    html,
  });

  if (shouldUseDevEmailFallback()) {
    console.log(`DEV EMAIL to ${to}: ${subject}`);
  }

  return info;
}

async function verifyEmailConnection() {
  if (shouldUseDevEmailFallback()) {
    console.log("Email verification skipped in development fallback mode.");
    return true;
  }

  try {
    const transporter = await buildTransport();
    await transporter.verify();
    return true;
  } catch (error) {
    console.warn(
      "Email verification failed; continuing without email service:",
      error.message,
    );
    return false;
  }
}

module.exports = {
  sendEmail,
  verifyEmailConnection,
};
