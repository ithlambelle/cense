// Reading and writing the dollar amounts a student types into a budget field.
// Amounts are whole cents everywhere else (money.ts); this is the one place
// text becomes cents.

// $1,000,000 a month is more than any student's budget needs, and keeps a
// typo like an extra few zeros from reaching the arithmetic.
export const MAX_AMOUNT_CENTS = 100_000_000;

// Thousands commas only in the right places: "1,200" and "12,000.50" are
// fine, "1,2,3" and "12,34" are not. A dollar sign is allowed up front, and a
// trailing "." is allowed so "25." does not flash an error while typing.
const AMOUNT = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?$/;

// "25" -> 2500, "$1,200.5" -> 120050, "" or "abc" or "-5" or "1.234" -> null.
export function parseDollarsToCents(text: string): number | null {
  const cleaned = text.trim().replace(/^\$\s*/, "");
  if (!AMOUNT.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

// What a field shows for a starting amount: no cents when it is whole
// dollars, two digits when it is not. 70000 -> "700", 1250 -> "12.50".
export function dollarsInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
