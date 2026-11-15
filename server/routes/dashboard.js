const { Router } = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isValidMonth } = require("../validation");

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  const month = req.query.month;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Month must use the YYYY-MM format." });
  const period = req.query.period || "six-months";
  if (!["six-months", "year"].includes(period)) {
    return res.status(400).json({ error: "Choose a supported report period." });
  }
  const monthCount = period === "year" ? 12 : 6;
  const startOffset = monthCount - 1;
  const monthStart = `${month}-01`;

  try {
    const [[summaryRows], [budgetRows], [categoryRows], [recentRows], [cashFlowRows]] = await Promise.all([
      db.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses,
          COUNT(*) AS transactionCount
         FROM transactions
         WHERE user_id = ? AND transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
        [req.user.id, monthStart, monthStart],
      ),
      db.query("SELECT amount FROM budgets WHERE user_id = ? AND budget_month = ?", [req.user.id, monthStart]),
      db.query(
        `SELECT c.id AS categoryId, c.name AS category, COALESCE(SUM(t.amount), 0) AS amount
         FROM categories c
         LEFT JOIN transactions t
           ON t.category_id = c.id AND t.user_id = c.user_id AND t.type = 'expense'
           AND t.transaction_date >= ? AND t.transaction_date < DATE_ADD(?, INTERVAL 1 MONTH)
         WHERE c.user_id = ? AND c.type = 'expense'
         GROUP BY c.id, c.name
         ORDER BY amount DESC, c.name`,
        [monthStart, monthStart, req.user.id],
      ),
      db.query(
        `SELECT t.id, t.description, t.amount, t.type, t.transaction_date AS date,
          t.category_id AS categoryId, c.name AS category
         FROM transactions t
         INNER JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
         WHERE t.user_id = ?
         ORDER BY t.transaction_date DESC, t.id DESC
         LIMIT 5`,
        [req.user.id],
      ),
      db.query(
        `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
         FROM transactions
         WHERE user_id = ?
           AND transaction_date >= DATE_SUB(?, INTERVAL ${startOffset} MONTH)
           AND transaction_date < DATE_ADD(?, INTERVAL 1 MONTH)
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
         ORDER BY month`,
        [req.user.id, monthStart, monthStart],
      ),
    ]);

    const income = Number(summaryRows[0].income);
    const expenses = Number(summaryRows[0].expenses);
    const [balanceRows] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance
       FROM transactions WHERE user_id = ?`,
      [req.user.id],
    );
    const cashFlowByMonth = new Map(cashFlowRows.map((row) => [row.month, {
      income: Number(row.income),
      expenses: Number(row.expenses),
    }]));
    const [year, monthNumber] = month.split("-").map(Number);
    const cashFlow = Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(Date.UTC(year, monthNumber - 1 - startOffset + index, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const totals = cashFlowByMonth.get(key) || { income: 0, expenses: 0 };
      return { month: key, ...totals };
    });
    const budget = budgetRows.length ? Number(budgetRows[0].amount) : 0;

    return res.json({
      month,
      period,
      income,
      expenses,
      netSavings: income - expenses,
      balance: Number(balanceRows[0].balance),
      budget,
      budgetRemaining: Math.max(0, budget - expenses),
      transactionCount: Number(summaryRows[0].transactionCount),
      categorySpending: categoryRows.map((row) => ({
        categoryId: row.categoryId,
        category: row.category,
        amount: Number(row.amount),
      })),
      recentTransactions: recentRows.map((row) => ({ ...row, amount: Number(row.amount) })),
      cashFlow,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
