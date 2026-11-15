const mysql = require("mysql2/promise");

const requiredEnvironment = ["DB_HOST", "DB_USER", "DB_NAME"];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);

if (missingEnvironment.length) {
  throw new Error(`Missing database configuration: ${missingEnvironment.join(", ")}`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  charset: "utf8mb4",
});

module.exports = {
  pool,
  query(sql, values = []) {
    return pool.execute(sql, values);
  },
  async close() {
    await pool.end();
  },
};
