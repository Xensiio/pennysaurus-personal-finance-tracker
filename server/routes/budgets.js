const { Router } = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isValidAmount, isValidMonth } = require("../validation");

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  const month = req.query.month;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });

  try {
    const [budgets] = await db.query(
      "SELECT id, amount FROM budgets WHERE user_id = ? AND budget_month = ?",
      [req.user.id, `${month}-01`],
    );
    const [categoryBudgets] = await db.query(
      `SELECT cb.id, cb.category_id AS categoryId, cb.amount, c.name AS category
       FROM category_budgets cb
       INNER JOIN categories c ON c.id = cb.category_id AND c.user_id = cb.user_id
       WHERE cb.user_id = ? AND cb.budget_month = ?
       ORDER BY c.name`,
      [req.user.id, `${month}-01`],
    );
    return res.json({
      month,
      budget: budgets.length ? budgets[0] : null,
      categoryBudgets,
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (req, res, next) => {
  const { month, amount } = req.body;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });
  if (!isValidAmount(amount)) return res.status(400).json({ error: "Budget must be greater than zero." });

  try {
    await db.query(
      `INSERT INTO budgets (user_id, budget_month, amount)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [req.user.id, `${month}-01`, amount],
    );
    return res.json({ message: "Monthly budget saved.", month, amount });
  } catch (error) {
    return next(error);
  }
});

router.put("/categories/:categoryId", async (req, res, next) => {
  const categoryId = Number(req.params.categoryId);
  const { month, amount } = req.body;
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) {
    return res.status(400).json({ error: "Choose a valid category." });
  }
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });
  if (!isValidAmount(amount)) return res.status(400).json({ error: "Category limit must be greater than zero." });

  try {
    const [categories] = await db.query(
      "SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = 'expense'",
      [categoryId, req.user.id],
    );
    if (!categories.length) return res.status(404).json({ error: "Expense category not found." });

    await db.query(
      `INSERT INTO category_budgets (user_id, category_id, budget_month, amount)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [req.user.id, categoryId, `${month}-01`, amount],
    );
    return res.json({ message: "Category budget saved." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
