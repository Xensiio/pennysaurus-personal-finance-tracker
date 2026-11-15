const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = new Set(["PHP", "USD", "EUR", "JPY"]);
const TRANSACTION_TYPES = new Set(["income", "expense"]);

function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);
}

function isValidMonth(value) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isValidAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 9999999999.99;
}

function isValidCurrency(value) {
  return CURRENCIES.has(value);
}

function isValidTransactionType(value) {
  return TRANSACTION_TYPES.has(value);
}

module.exports = {
  isValidAmount,
  isValidCurrency,
  isValidDate,
  isValidEmail,
  isValidMonth,
  isValidTransactionType,
};
