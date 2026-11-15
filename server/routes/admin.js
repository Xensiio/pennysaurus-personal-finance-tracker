const { Router } = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/admin");
const { requireAuth } = require("../middleware/auth");
const { isValidMonth } = require("../validation");

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/users", async (req, res, next) => {
  try {
    const [users] = await db.query(
      `SELECT id, name, email, role, created_at AS createdAt
       FROM users ORDER BY created_at DESC, id DESC LIMIT 500`,
    );
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:id/role", async (req, res, next) => {
  const id = Number(req.params.id);
  const role = req.body.role;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid user ID." });
  if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "Choose a valid user role." });
  if (id === Number(req.user.id)) {
    return res.status(400).json({ error: "You cannot change your own administrator role." });
  }

  const connection = await db.pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [[target]] = await connection.execute("SELECT id, role FROM users WHERE id = ? FOR UPDATE", [id]);
    if (!target) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ error: "User not found." });
    }

    if (target.role === "admin" && role === "user") {
      const [admins] = await connection.execute("SELECT id FROM users WHERE role = 'admin' FOR UPDATE");
      if (admins.length <= 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ error: "The last administrator cannot be demoted." });
      }
    }

    await connection.execute("UPDATE users SET role = ? WHERE id = ?", [role, id]);
    await connection.commit();
    transactionStarted = false;
    return res.json({ message: "User role updated." });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get("/reports", async (req, res, next) => {
  const month = req.query.month;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });
  const start = `${month}-01`;

  try {
    const [[userRows], [transactionRows]] = await Promise.all([
      db.query("SELECT COUNT(*) AS userCount FROM users"),
      db.query(
        `SELECT COUNT(*) AS transactionCount,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
         FROM transactions
         WHERE transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
        [start, start],
      ),
    ]);
    return res.json({
      month,
      userCount: Number(userRows[0].userCount),
      transactionCount: Number(transactionRows[0].transactionCount),
      income: Number(transactionRows[0].income),
      expenses: Number(transactionRows[0].expenses),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
