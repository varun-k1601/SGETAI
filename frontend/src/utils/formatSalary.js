import { SUPPORTED_CURRENCIES } from "./currencies";

const CURRENCY_SYMBOLS = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency.symbol])
);

function getCurrencyPrefix(currency) {
  const normalized = String(currency || "USD").trim().toUpperCase();
  return CURRENCY_SYMBOLS[normalized] || (normalized ? `${normalized} ` : "$");
}

function formatAmount(amount, currency) {
  const normalized = String(currency || "USD").trim().toUpperCase();

  if (normalized === "INR") {
    return `${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  }

  return `${(amount / 1000).toFixed(0)}k`;
}

export function formatSalary(salary) {
  if (!salary || (!salary.min && !salary.max)) {
    return "";
  }

  const prefix = getCurrencyPrefix(salary.currency);
  const min = salary.min ? `${prefix}${formatAmount(salary.min, salary.currency)}` : "";
  const max = salary.max ? `${prefix}${formatAmount(salary.max, salary.currency)}` : "";

  if (min && max) {
    return `${min} – ${max}`;
  }

  return min || max;
}
