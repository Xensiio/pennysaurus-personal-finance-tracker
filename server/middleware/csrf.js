const crypto = require("node:crypto");

function createCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const expected = req.session.csrfToken;
  const supplied = req.get("X-CSRF-Token");
  if (
    typeof supplied !== "string"
    || typeof expected !== "string"
    || !/^[a-f0-9]{64}$/.test(supplied)
    || !/^[a-f0-9]{64}$/.test(expected)
    || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return res.status(403).json({ error: "The request could not be verified. Refresh the page and try again." });
  }

  return next();
}

module.exports = { createCsrfToken, requireCsrf };
