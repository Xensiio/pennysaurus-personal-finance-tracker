const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_KEYS = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_SSL",
  "DB_SSL_CA",
  "TIDB_HOST",
  "TIDB_PORT",
  "TIDB_USER",
  "TIDB_PASSWORD",
  "TIDB_DATABASE",
  "TIDB_SSL_CA",
];

async function withDatabaseConfig(environment, verify) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, environment);

  const modulePath = require.resolve("./db");
  delete require.cache[modulePath];
  let connectionPool;
  try {
    connectionPool = require("./db").pool;
    await verify(connectionPool.pool.config.connectionConfig);
  } finally {
    if (connectionPool) await connectionPool.end();
    delete require.cache[modulePath];
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("maps TiDB integration variables and defaults to verified TLS", async () => {
  await withDatabaseConfig({
    TIDB_HOST: "tidb.example.test",
    TIDB_PORT: "4000",
    TIDB_USER: "test-user",
    TIDB_PASSWORD: "not-a-real-password",
    TIDB_DATABASE: "pennysaurus",
  }, (config) => {
    assert.equal(config.host, "tidb.example.test");
    assert.equal(config.port, 4000);
    assert.equal(config.user, "test-user");
    assert.equal(config.database, "pennysaurus");
    assert.equal(config.ssl.rejectUnauthorized, true);
  });
});

test("supports DB variables and a provider CA certificate", async () => {
  await withDatabaseConfig({
    DB_HOST: "mysql.example.test",
    DB_PORT: "3307",
    DB_USER: "test-user",
    DB_PASSWORD: "not-a-real-password",
    DB_NAME: "pennysaurus",
    DB_SSL: "true",
    DB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----",
  }, (config) => {
    assert.equal(config.host, "mysql.example.test");
    assert.equal(config.port, 3307);
    assert.equal(config.database, "pennysaurus");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.match(config.ssl.ca, /\nexample\n/);
  });
});
