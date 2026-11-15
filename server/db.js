const mysql = require("mysql2/promise");

const host = process.env.DB_HOST || process.env.TIDB_HOST;
const user = process.env.DB_USER || process.env.TIDB_USER;
const database = process.env.DB_NAME || process.env.TIDB_DATABASE;
const port = process.env.DB_PORT || process.env.TIDB_PORT || 3306;
const password = process.env.DB_PASSWORD || process.env.TIDB_PASSWORD || "";
const missingEnvironment = [
  !host && "DB_HOST or TIDB_HOST",
  !user && "DB_USER or TIDB_USER",
  !database && "DB_NAME or TIDB_DATABASE",
].filter(Boolean);
const sslCa = (process.env.DB_SSL_CA || process.env.TIDB_SSL_CA)?.replace(/\\n/g, "\n");
const sslEnabled = process.env.DB_SSL === "true"
  || (Boolean(process.env.TIDB_HOST) && process.env.DB_SSL !== "false");

if (missingEnvironment.length) {
  throw new Error(`Missing database configuration: ${missingEnvironment.join(", ")}.`);
}

const pool = mysql.createPool({
  host,
  port: Number(port),
  user,
  password,
  database,
  ssl: sslEnabled
    ? {
      rejectUnauthorized: true,
      ...(sslCa ? { ca: sslCa } : {}),
    }
    : undefined,
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
