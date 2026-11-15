const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidAmount,
  isValidCurrency,
  isValidDate,
  isValidEmail,
  isValidMonth,
  isValidTransactionType,
} = require("./validation");

test("validates calendar months and dates", () => {
  assert.equal(isValidMonth("2026-11"), true);
  assert.equal(isValidMonth("2026-13"), false);
  assert.equal(isValidDate("2024-02-29"), true);
  assert.equal(isValidDate("2026-02-29"), false);
});

test("validates account and transaction values", () => {
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidAmount(0.01), true);
  assert.equal(isValidAmount(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidCurrency("PHP"), true);
  assert.equal(isValidCurrency("ABC"), false);
  assert.equal(isValidTransactionType("expense"), true);
  assert.equal(isValidTransactionType("transfer"), false);
});
