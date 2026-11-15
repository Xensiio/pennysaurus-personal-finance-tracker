const { Router } = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, type FROM categories WHERE user_id = ? ORDER BY type, name",
      [req.user.id],
    );
    return res.json({ categories: rows });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
