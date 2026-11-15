const { Router } = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { createCsrfToken } = require("../middleware/csrf");
const {
  isValidCurrency,
  isValidEmail,
} = require("../validation");

const router = Router();
const DEFAULT_CATEGORIES = [
  ["Salary", "income"],
  ["Other income", "income"],
  ["Food & groceries", "expense"],
  ["Bills & utilities", "expense"],
  ["Transport", "expense"],
  ["Housing", "expense"],
  ["Health", "expense"],
  ["Shopping", "expense"],
  ["Other", "expense"],
];

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function establishSession(req, user) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.csrfToken = createCsrfToken();
  await saveSession(req);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    currency: user.currency,
  };
}

router.get("/session", async (req, res, next) => {
  try {
    if (!req.session.csrfToken) {
      req.session.csrfToken = createCsrfToken();
      await saveSession(req);
    }

    if (!req.session.userId) {
      return res.json({ user: null, csrfToken: req.session.csrfToken });
    }

    const [rows] = await db.query(
      "SELECT id, name, email, currency FROM users WHERE id = ?",
      [req.session.userId],
    );
    if (!rows.length) {
      return req.session.destroy((error) => {
        if (error) return next(error);
        res.json({ user: null, csrfToken: null });
      });
    }

    return res.json({ user: rows[0], csrfToken: req.session.csrfToken });
  } catch (error) {
    return next(error);
  }
});

router.post("/register", async (req, res, next) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "Name must be between 2 and 80 characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  }

  const connection = await db.pool.getConnection();
  let transactionStarted = false;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash],
    );
    const user = { id: result.insertId, name, email, currency: "PHP" };
    const categoryPlaceholders = DEFAULT_CATEGORIES.map(() => "(?, ?, ?)").join(", ");
    const categoryValues = DEFAULT_CATEGORIES.flatMap(([categoryName, type]) => [user.id, categoryName, type]);
    await connection.execute(
      `INSERT INTO categories (user_id, name, type) VALUES ${categoryPlaceholders}`,
      categoryValues,
    );
    await connection.commit();
    transactionStarted = false;
    const sessionUser = await establishSession(req, user);
    return res.status(201).json({ user: sessionUser, csrfToken: req.session.csrfToken });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post("/login", async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  if (!isValidEmail(email) || typeof password !== "string" || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, name, email, currency, password_hash FROM users WHERE email = ?",
      [email],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }

    const sessionUser = await establishSession(req, user);
    return res.json({ user: sessionUser, csrfToken: req.session.csrfToken });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("pennysaurus.sid");
    return res.status(204).end();
  });
});

router.patch("/profile", requireAuth, async (req, res, next) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const currency = req.body.currency;

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "Name must be between 2 and 80 characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!isValidCurrency(currency)) {
    return res.status(400).json({ error: "Choose a supported currency." });
  }

  try {
    await db.query(
      "UPDATE users SET name = ?, email = ?, currency = ? WHERE id = ?",
      [name, email, currency, req.user.id],
    );
    return res.json({ user: { ...req.user, name, email, currency } });
  } catch (error) {
    return next(error);
  }
});

router.put("/password", requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || currentPassword.length > 128) {
    return res.status(400).json({ error: "Enter your current password." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: "New password must be between 8 and 128 characters." });
  }

  try {
    const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, req.user.id]);
    return res.json({ message: "Password updated." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
