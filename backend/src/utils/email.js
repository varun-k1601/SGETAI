const nodemailer = require("nodemailer");

function shouldUseDevEmailFallback() {
  const emailUser = process.env.EMAIL_USER || "";
  const emailPass = process.env.EMAIL_PASS || "";

  return (
    process.env.NODE_ENV !== "production" &&
    (emailUser.includes("your_email") || emailPass.includes("replace_me"))
  );
}

function buildTransport() {
  if (shouldUseDevEmailFallback()) {
    return nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendEmail(to, subject, html) {
  const transporter = buildTransport();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  });

  if (shouldUseDevEmailFallback()) {
    console.log(`DEV EMAIL to ${to}: ${subject}`);
  }

  return info;
}

async function verifyEmailConnection() {
  if (shouldUseDevEmailFallback()) {
    return true;
  }

  const transporter = buildTransport();
  await transporter.verify();
  return true;
}

module.exports = {
  sendEmail,
  verifyEmailConnection
};
