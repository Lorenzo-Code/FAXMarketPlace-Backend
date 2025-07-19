// utils/logAudit.js
const AuditLog = require("../models/AuditLog");

const logAudit = async ({ type, userId, email, action, metadata = {} }) => {
  try {
    await AuditLog.create({ type, userId, email, action, metadata });
  } catch (err) {
    console.error("❌ Failed to write audit log:", err.message);
  }
};

module.exports = logAudit;
