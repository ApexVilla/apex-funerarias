const { run } = require("../models/db");

async function logAudit({ userId, action, clientId = null, details = null }) {
  await run(
    "INSERT INTO audit_logs (user_id, action, client_id, details) VALUES (?, ?, ?, ?)",
    [userId, action, clientId, details]
  );
}

module.exports = {
  logAudit
};
