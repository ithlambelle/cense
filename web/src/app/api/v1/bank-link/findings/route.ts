// Created with Claude Code (2026-11-21). POST /api/v1/bank-link/findings: Penny
// reads the bank the student just linked (US-16).
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import type { BankFindings } from "@/lib/api/safe-to-spend";
import { loadBudget } from "@/lib/budget/store";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend, recentTransactions, saveAnswers } from "@/lib/plaid/store";
import { inferSetup } from "@/lib/safe-to-spend/infer";

// How far back Cense reads to learn pay and bills: enough for three sightings
// of a monthly bill (the detector's minimum) plus a semester's tuition.
const READ_DAYS = 124;
// Answers are saved from the bank only when its history reaches back at least
// this far. Plaid's first pull right after linking can hold a few days or
// nothing at all (PRODUCT_NOT_READY), and answering from that would save every
// bill as "none": rent never reserved, and the answers never asked again. The
// stand-in bank's sample month is always at least 24 days old.
const MIN_HISTORY_DAYS = 21;
// Last month is shown for "Looks right?" only when the history starts in its
// first week, so a half month is never confirmed as the whole month.
const MONTH_START_SLACK_DAYS = 7;
const DAY_MS = 86_400_000;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function easternDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Reads what the linked bank already shows and, the first time, answers the
// setup questions with it (Ben, Nov 21: no questions we can answer from the
// data). A student who already answered keeps every answer; they still get
// the findings. Runs as the student, on their own rows only.
export async function POST(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const before = await loadSafeToSpend(student);
  if (!before.ok) return databaseError("safe_to_spend_read", before.error);
  if (!before.value) return notLinked();

  const rows = await recentTransactions(student, READ_DAYS);
  if (!rows.ok) return databaseError("bank_findings_read", rows.error);
  const today = easternDate();
  const oldest = rows.value.reduce<string | null>((min, row) => (min === null || row.posted_on < min ? row.posted_on : min), null);
  const enoughHistory = oldest !== null && daysBetween(oldest, today) >= MIN_HISTORY_DAYS;

  // Too little history to answer from: nothing is saved, and a student who
  // has not answered yet is sent to the questions.
  if (!enoughHistory && !before.value.answered) {
    console.warn(JSON.stringify({ event: "bank_findings_thin_history", days: oldest === null ? 0 : daysBetween(oldest, today) }));
    const body: BankFindings = { findings: [], answeredFromBank: false, enoughHistory: false, safeToSpend: before.value, lastMonth: null };
    return Response.json(body, { headers: NO_STORE });
  }

  const inferred = inferSetup(rows.value, today);
  const { bills } = inferred;
  // A student who already answered sees what the bank shows, but a bill they
  // said they pay is never listed as "not in your bank".
  const paid = new Set<string>(before.value.answered ? before.value.bills.filter((b) => b.coveredBy !== "none").map((b) => b.bill) : []);
  const findings = inferred.findings.filter((finding) => finding.found || !paid.has(finding.kind));

  let answeredFromBank = false;
  if (!before.value.answered) {
    const saved = await saveAnswers(student, { bills, setAsideCents: before.value.setAsideCents });
    if (!saved.ok) return databaseError("safe_to_spend_answers_save", saved.error);
    if (!saved.value) return notLinked();
    answeredFromBank = true;
  }

  const after = answeredFromBank ? await loadSafeToSpend(student) : before;
  if (!after.ok) return databaseError("safe_to_spend_read", after.error);
  if (!after.value) return notLinked();
  // Last month, for "Looks right?". Extra: a failed read, or a history that
  // does not cover the month, leaves it out and the findings still show.
  const budget = await loadBudget(student, after.value.setAsideCents);
  if (!budget.ok) console.warn(JSON.stringify({ event: "bank_findings_budget_read_failed" }));
  const covered = budget.ok && oldest !== null && daysBetween(budget.value.month, oldest) <= MONTH_START_SLACK_DAYS;
  const body: BankFindings = { findings, answeredFromBank, enoughHistory, safeToSpend: after.value, lastMonth: budget.ok && covered ? budget.value : null };
  return Response.json(body, { headers: NO_STORE });
}
