const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

async function ensureSuperAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASS) {
    return null;
  }

  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    return existingAdmin;
  }

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASS, 10);

  return Admin.create({
    email,
    passwordHash,
    role: "SuperAdmin"
  });
}

module.exports = {
  ensureSuperAdmin
};
