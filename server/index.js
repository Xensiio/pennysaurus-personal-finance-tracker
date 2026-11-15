require("dotenv").config();

const app = require("./app");
const db = require("./db");

const port = Number(process.env.PORT || 3000);
let server;

async function shutdown(signal) {
  process.stdout.write(`${signal} received; closing the server.\n`);
  if (!server) {
    await app.locals.sessionStore.close();
    await db.close();
    return;
  }
  server.close(async (error) => {
    try {
      await app.locals.sessionStore.close();
      await db.close();
      if (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }
    } catch (closeError) {
      process.stderr.write(`${closeError.message}\n`);
      process.exitCode = 1;
    }
  });
}

async function start() {
  await db.query("SELECT 1");
  await app.locals.sessionStore.onReady();
  server = app.listen(port, () => {
    process.stdout.write(`Pennysaurus is listening on port ${port}.\n`);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
start().catch(async (error) => {
  process.stderr.write(`Could not start Pennysaurus: ${error.message}\n`);
  process.exitCode = 1;
  try {
    await db.close();
  } catch (closeError) {
    process.stderr.write(`Could not close the database pool: ${closeError.message}\n`);
  }
});
