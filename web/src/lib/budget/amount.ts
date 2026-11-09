import { dollarsToCents } from "@/lib/money";

// Reading and writing the dollar amounts a student types into a budget field.
// Amounts are whole cents everywhere else (money.ts); this is the one place
// text becomes cents.

// $1,000,000 a month is more than any student's budget needs, and keeps a
// typo like an extra few zeros from reaching the arithmetic.
export const MAX_AMOUNT_CENTS = 100_000_000;

// Use the shared parser, with the budget's own range and typing behavior.
export function parseDollarsToCents(text: string): number | null {
  return dollarsToCents(text, { minCents: 0, maxCents: MAX_AMOUNT_CENTS });
}

// What a field shows for a starting amount: no cents when it is whole
// dollars, two digits when it is not. 70000 -> "700", 1250 -> "12.50".
export function dollarsInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
