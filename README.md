# Pennysaurus - Personal Finance Tracker

Pennysaurus is a web app I built for my Web Systems Technology final project. It helps users keep track of their income, expenses, monthly budgets, and savings goals. The default currency is Philippine pesos. I themed it around dinosaurs because I love them and I can info dump about them for hours.

## Project information

- Student: Bernalie Tiangco
- Section: 2nd Year - Block 4
- GitHub: https://github.com/Xensiio/smart-personal-finance-tracker
- Live demo: https://pennysaurus-project.vercel.app/

## Main features

- Create an account and sign in to keep each user's records separate.
- Add, edit, and delete income and expense transactions.
- Organize transactions with categories and review monthly activity.
- Set monthly and category budgets.
- Create savings goals and track contributions.
- View dashboard summaries and reports with charts.
- Use the app on desktop, tablet, or mobile.

## Technology

- Frontend: HTML, CSS, JavaScript, Bootstrap 5, and Chart.js
- Backend: Node.js and Express
- Database: MySQL or MariaDB locally; TiDB Cloud Serverless for deployment
- API: Express JSON REST API called from the browser with the Fetch API

## Modern features

- Responsive layout for desktop, tablet, and mobile screens.
- Interactive cash-flow and report charts.
- Session-based authentication with CSRF protection and rate-limited sign-in and registration.

## Run locally

You will need Node.js 20 or later and a MySQL-compatible database.

1. Import `database/database.sql` into your local MySQL or MariaDB server.
2. Copy `.env.example` to `.env` and add your local database settings. Set `SESSION_SECRET` to a private random value of at least 32 characters.
3. Install dependencies and start the app:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000`. To run the automated tests, use `npm test`.

## Database and deployment

`database/database.sql` creates the database tables; it does not contain sample records. Use fictional data for the demo, and include a separate anonymized database backup in the final submission if required.

The deployed app runs on Vercel and uses TiDB Cloud. The Express entry point is `index.js`, and the browser files are in `public/`. Set `SESSION_SECRET` and the TiDB connection variables in Vercel's environment settings. Do not put their values in this repository.

This project is prepared for a school demonstration. Do not enter real financial information.

## Security

Never commit or share `.env`, database passwords, session secrets, or other credentials. Keep `.env` on your computer; use Vercel's environment-variable settings for deployment.
