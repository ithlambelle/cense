// Credit limits as students type them, for the forms that ask for one.

export const LIMIT_ERROR = "Enter the limit in dollars, like 500 or 1,500.";

// The largest limit accepted, in whole dollars. Well above student card limits;
// it only catches typing mistakes such as an extra zero run.
const MAX_LIMIT_DOLLARS = 100_000;

// Parses "$1,500", "1500" or "500.00" to cents. Null for empty; undefined when
// it is not a limit (bad comma grouping, more than 2 decimals, under $1, too large).
export function limitToCents(value: string): number | null | undefined {
  const cleaned = value.trim().replace(/^\$\s*/, "");
  if (cleaned === "") return null;
  if (!/^(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const cents = Math.round(Number(cleaned.replace(/,/g, "")) * 100);
  if (cents < 100 || cents > MAX_LIMIT_DOLLARS * 100) return undefined;
  return cents;
}

export function centsToField(cents: number | null): string {
  if (cents === null) return "";
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}
