const { Router } = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  isValidAmount,
  isValidDate,
  isValidMonth,
  isValidTransactionType,
} = require("../validation");

const router = Router();
const ORDER_BY = {
  newest: "t.transaction_date DESC, t.id DESC",
  oldest: "t.transaction_date ASC, t.id ASC",
  highest: "t.amount DESC, t.transaction_date DESC",
  lowest: "t.amount ASC, t.transaction_date DESC",
  name: "t.description ASC, t.transaction_date DESC",
};

router.use(requireAuth);

function validateTransaction(body) {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const categoryId = Number(body.categoryId);
  if (description.length < 1 || description.length > 120) {
    return "Description must be between 1 and 120 characters.";
  }
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) {
    return "Choose a valid category.";
  }
  if (!isValidTransactionType(body.type)) {
    return "Choose income or expense as the transaction type.";
  }
  if (!isValidAmount(body.amount)) {
    return "Amount must be greater than zero and within the supported limit.";
  }
  if (!isValidDate(body.date)) {
    return "Enter a valid transaction date.";
  }
  return null;
}

async function categoryMatchesUser(categoryId, type, userId) {
  const [rows] = await db.query(
    "SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = ?",
    [categoryId, userId, type],
  );
  return rows.length > 0;
}

router.get("/", async (req, res, next) => {
  const { month, type, categoryId, search = "", sort = "newest" } = req.query;
  if (month && !isValidMonth(month)) {
    return res.status(400).json({ error: "Month must use the YYYY-MM format." });
  }
  if (type && !isValidTransactionType(type)) {
    return res.status(400).json({ error: "Choose income or expense as the type filter." });
  }
  if (categoryId && (!/^\d+$/.test(categoryId) || Number(categoryId) < 1)) {
    return res.status(400).json({ error: "Choose a valid category filter." });
  }
  if (typeof search !== "string" || search.length > 100) {
    return res.status(400).json({ error: "Search text cannot exceed 100 characters." });
  }
  if (!Object.hasOwn(ORDER_BY, sort)) {
    return res.status(400).json({ error: "Choose a supported sort order." });
  }

  const conditions = ["t.user_id = ?"];
  const values = [req.user.id];
  if (month) {
    conditions.push("t.transaction_date >= ? AND t.transaction_date < DATE_ADD(?, INTERVAL 1 MONTH)");
    values.push(`${month}-01`, `${month}-01`);
  }
  if (type) {
    conditions.push("t.type = ?");
    values.push(type);
  }
  if (categoryId) {
    conditions.push("t.category_id = ?");
    values.push(Number(categoryId));
  }
  if (search.trim()) {
    conditions.push("(t.description LIKE ? OR c.name LIKE ?)");
    values.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.description, t.amount, t.type, t.transaction_date AS date,
        t.category_id AS categoryId, c.name AS category
       FROM transactions t
       INNER JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${ORDER_BY[sort]}
       LIMIT 500`,
      values,
    );
    return res.json({ transactions: rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const errorMessage = validateTransaction(req.body);
  if (errorMessage) return res.status(400).json({ error: errorMessage });

  try {
    const categoryId = Number(req.body.categoryId);
    if (!(await categoryMatchesUser(categoryId, req.body.type, req.user.id))) {
      return res.status(400).json({ error: "Choose a category that matches the transaction type." });
    }
    const [result] = await db.query(
      `INSERT INTO transactions
        (user_id, category_id, description, amount, type, transaction_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, categoryId, req.body.description.trim(), req.body.amount, req.body.type, req.body.date],
    );
    return res.status(201).json({
      transaction: {
        id: result.insertId,
        categoryId,
        category: null,
        description: req.body.description.trim(),
        amount: req.body.amount,
        type: req.body.type,
        date: req.body.date,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid transaction ID." });

  const errorMessage = validateTransaction(req.body);
  if (errorMessage) return res.status(400).json({ error: errorMessage });

  try {
    const categoryId = Number(req.body.categoryId);
    if (!(await categoryMatchesUser(categoryId, req.body.type, req.user.id))) {
      return res.status(400).json({ error: "Choose a category that matches the transaction type." });
    }
    const [result] = await db.query(
      `UPDATE transactions
       SET category_id = ?, description = ?, amount = ?, type = ?, transaction_date = ?
       WHERE id = ? AND user_id = ?`,
      [categoryId, req.body.description.trim(), req.body.amount, req.body.type, req.body.date, id, req.user.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Transaction not found." });
    return res.json({ message: "Transaction updated." });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid transaction ID." });

  try {
    const [result] = await db.query(
      "DELETE FROM transactions WHERE id = ? AND user_id = ?",
      [id, req.user.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Transaction not found." });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
