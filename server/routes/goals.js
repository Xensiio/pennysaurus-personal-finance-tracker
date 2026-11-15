const { Router } = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isValidAmount, isValidMonth } = require("../validation");

const router = Router();
router.use(requireAuth);

function validGoal(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const target = Number(body.target);
  const contribution = Number(body.contribution);
  if (name.length < 1 || name.length > 80) return "Goal name must be between 1 and 80 characters.";
  if (!isValidAmount(target)) return "Target must be greater than zero.";
  if (!Number.isFinite(contribution) || contribution < 0 || contribution > 9999999999.99) {
    return "Monthly contribution cannot be negative.";
  }
  if (!isValidMonth(body.targetMonth)) return "Target month must use the YYYY-MM format.";
  return null;
}

router.get("/", async (req, res, next) => {
  const month = req.query.month;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });

  try {
    const [[goals], [activity]] = await Promise.all([
      db.query(
        `SELECT id, name, target_amount AS target, saved_amount AS saved,
          DATE_FORMAT(target_month, '%Y-%m') AS targetMonth,
          monthly_contribution AS contribution
         FROM goals WHERE user_id = ? ORDER BY created_at`,
        [req.user.id],
      ),
      db.query(
        `SELECT sa.id, sa.goal_id AS goalId, g.name AS goalName, sa.amount,
          sa.activity_date AS date
         FROM savings_activity sa
         INNER JOIN goals g ON g.id = sa.goal_id AND g.user_id = sa.user_id
         WHERE sa.user_id = ? AND sa.activity_date >= ?
           AND sa.activity_date < DATE_ADD(?, INTERVAL 1 MONTH)
         ORDER BY sa.activity_date DESC, sa.id DESC`,
        [req.user.id, `${month}-01`, `${month}-01`],
      ),
    ]);
    return res.json({
      goals: goals.map((goal) => ({
        ...goal,
        target: Number(goal.target),
        saved: Number(goal.saved),
        contribution: Number(goal.contribution),
      })),
      activity: activity.map((item) => ({ ...item, amount: Number(item.amount) })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const errorMessage = validGoal(req.body);
  if (errorMessage) return res.status(400).json({ error: errorMessage });
  const name = req.body.name.trim();

  try {
    const [result] = await db.query(
      `INSERT INTO goals (user_id, name, target_amount, target_month, monthly_contribution)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, name, Number(req.body.target), `${req.body.targetMonth}-01`, Number(req.body.contribution)],
    );
    return res.status(201).json({
      goal: {
        id: result.insertId,
        name,
        target: Number(req.body.target),
        saved: 0,
        targetMonth: req.body.targetMonth,
        contribution: Number(req.body.contribution),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid savings goal ID." });
  const errorMessage = validGoal(req.body);
  if (errorMessage) return res.status(400).json({ error: errorMessage });

  try {
    const [result] = await db.query(
      `UPDATE goals SET name = ?, target_amount = ?, target_month = ?, monthly_contribution = ?
       WHERE id = ? AND user_id = ?`,
      [req.body.name.trim(), Number(req.body.target), `${req.body.targetMonth}-01`, Number(req.body.contribution), id, req.user.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Savings goal not found." });
    return res.json({ message: "Savings goal updated." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid savings goal ID." });

  try {
    const [result] = await db.query("DELETE FROM goals WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Savings goal not found." });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/contributions", async (req, res, next) => {
  const id = Number(req.params.id);
  const amount = Number(req.body.amount);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid savings goal ID." });
  if (!isValidAmount(amount)) return res.status(400).json({ error: "Contribution must be greater than zero." });

  const connection = await db.pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [req.user.id]);
    const [[balanceRow]] = await connection.execute(
      `SELECT
        COALESCE((SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END)
          FROM transactions WHERE user_id = ?), 0)
        - COALESCE((SELECT SUM(amount) FROM savings_activity WHERE user_id = ?), 0) AS balance`,
      [req.user.id, req.user.id],
    );
    const [[goal]] = await connection.execute(
      "SELECT id FROM goals WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, req.user.id],
    );
    if (!goal) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ error: "Savings goal not found." });
    }
    if (amount > Number(balanceRow.balance)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ error: "Contribution exceeds your available balance." });
    }

    const date = new Date().toISOString().slice(0, 10);
    await connection.execute(
      "UPDATE goals SET saved_amount = saved_amount + ? WHERE id = ? AND user_id = ?",
      [amount, id, req.user.id],
    );
    const [activityResult] = await connection.execute(
      "INSERT INTO savings_activity (user_id, goal_id, amount, activity_date) VALUES (?, ?, ?, ?)",
      [req.user.id, id, amount, date],
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json({ id: activityResult.insertId, goalId: id, amount, date });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

module.exports = router;
