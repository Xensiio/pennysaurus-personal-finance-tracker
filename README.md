# Pennysaurus

Responsive personal finance tracker built with HTML, CSS, browser JavaScript, Express, and MySQL-compatible storage.

## Local setup

1. Install Node.js 20+ and MariaDB/MySQL.
2. Import `database/database.sql` into the database server.
3. Copy `.env.example` to `.env`; configure the local database and a private `SESSION_SECRET` of at least 32 characters.
4. Run `npm install`, then `npm start`; open `http://localhost:3000`.
5. Run `npm test` for validation and database-configuration tests.

Never commit or share `.env`.

## Vercel and TiDB Cloud

The root `index.js` exports the Express app for Vercel Functions. Static browser files are stored in `public/`; Vercel serves them separately from the Express function. The app expects an external MySQL-compatible database; local MariaDB is not reachable by Vercel. TiDB Cloud Serverless is MySQL-compatible; PostgreSQL services such as Neon require a database migration.

Connect TiDB Cloud's Vercel integration to this project using a **Cluster** connection and select **General** as the framework. The integration supplies `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DATABASE`; TLS is enabled automatically for the `TIDB_*` configuration. Import `database/database.sql` into the selected TiDB database. In Vercel Project Settings → Environment Variables, add a new `SESSION_SECRET` (at least 32 random characters) for Preview and Production.

Deployment is not complete until `/api/auth/session` returns HTTP 200 with JSON and registration, login, and saved data have been tested against TiDB. Never commit database credentials or `.env`.
