import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import type { BankFindings } from "@/lib/api/safe-to-spend";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend, recentTransactions, saveAnswers } from "@/lib/plaid/store";
import { inferSetup } from "@/lib/safe-to-spend/infer";

// How far back Cense reads to learn pay and bills: enough for three sightings
// of a monthly bill (the detector's minimum) plus a semester's tuition.
const READ_DAYS = 124;

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
  const { bills, findings } = inferSetup(rows.value, easternDate());

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
  const body: BankFindings = { findings, answeredFromBank, safeToSpend: after.value };
  return Response.json(body, { headers: NO_STORE });
}
