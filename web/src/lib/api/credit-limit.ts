// Created with Claude Code (2026-11-26). The one rule for a card's credit
// limit, used by the API's schemas, every form that takes a limit, and every
// read of a saved limit.
import { z } from "zod";

import { dollarsToCents } from "../money";

// $1 to $100,000. The top is well above student card limits; it only catches
// typing mistakes such as an extra run of zeros. A limit of $0 is not a limit:
// it is "I don't know yet", which is no limit (null).
export const creditLimitCentsSchema = z.int().min(100).max(10_000_000);

// What a student typed in a credit limit field: null when it is empty, the
// cents when it is a limit the API accepts, undefined when it is not ("0",
// "-5", "12,34", more than 2 decimals, too large). The schema decides the
// range, so the form and the API cannot drift apart.
export function typedCreditLimitCents(value: string): number | null | undefined {
  if (/^\s*\$?\s*$/.test(value)) return null;
  const cents = dollarsToCents(value, { minCents: 0, maxCents: Number.MAX_SAFE_INTEGER });
  return cents !== null && creditLimitCentsSchema.safeParse(cents).success ? cents : undefined;
}

// A saved limit as the app uses it. One saved before the API kept to this
// rule (a $0 limit was accepted until Nov 26, 2026) reads as no limit, so no
// screen shows "$0 limit" or works a target out of it; the student is asked
// for the limit again where one is needed.
export function savedCreditLimitCents(value: number | string | null): number | null {
  if (value === null) return null;
  const cents = Number(value);
  if (creditLimitCentsSchema.safeParse(cents).success) return cents;
  console.warn(JSON.stringify({ event: "credit_limit_ignored", reason: "outside_rule" }));
  return null;
}
