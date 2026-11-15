const db = require("../db");

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, name, email, currency, role FROM users WHERE id = ?",
      [req.session.userId],
    );
    if (!rows.length) {
      return req.session.destroy((error) => {
        if (error) return next(error);
        return res.status(401).json({ error: "Your session has expired. Please sign in again." });
      });
    }

    req.user = rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth };
