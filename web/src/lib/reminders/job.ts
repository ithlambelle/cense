import "server-only";

import { captureServer, type ServerEvent, withAnalyticsOn } from "@/lib/analytics-server";
import type { ServiceClient } from "@/lib/supabase/service";

import { RESEND_EMAILS_URL } from "./config";
import { buildReminderEmail, type ReminderEmailKind } from "./email";
import { unsubscribeToken } from "./unsubscribe-token";

// The daily reminder job: schedule, claim, send, mark sent. The database
// decides what is due and enforces the rules (at most one email a day per
// student, unsubscribed and turned-off kinds skipped, one attempt a day and 3
// in all); this sends exactly what claim_due_reminders returns. Each one
// marked sent is copied to analytics as reminder_sent, unless the student
// turned the Analytics switch off (checked after every email has gone out).
//
// Logs carry counts, HTTP statuses and error codes only: never an email
// address, a name, a card or a key.

export type ReminderJobConfig = {
  resendApiKey: string;
  fromEmail: string;
  appUrl: string;
  unsubscribeSecret: string;
  // Resend's send endpoint; a stand-in only in the journey tests (config.ts).
  resendUrl?: string;
};

export type ReminderJobResult = {
  claimed: number;
  sent: number;
  failed: number;
  // sent through Resend but not marked sent; retried after the 15-minute
  // claim window, with Resend's idempotency key guarding a second send
  unconfirmed: number;
  // claimed but not attempted because the run ran out of time; released
  deferred: number;
  // released for the last time (its third attempt): never tried again
  abandoned: number;
  // every student's next reminders were planned this run. False when the
  // refresh failed or ran out of time; the next run carries on where it
  // stopped (refresh_all_reminders remembers), and the heartbeat says fail.
  refreshed: boolean;
};

export type ReminderJobOptions = {
  // When the run began (the cron route's start, on the same clock as `now`),
  // so work done before the job, like the follow-ups, counts against the
  // budget. Defaults to the job's own start.
  startedAt?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  capture?: (events: ServerEvent[]) => Promise<void>;
};

// claim_due_reminders returns at most this many, so a run fits well inside
// Vercel's function time limit at Resend's default rate of 2 requests a second
export const CLAIM_LIMIT = 50;
const SEND_INTERVAL_MS = 550;
// No new email starts after this, counted from the start of the run. The
// worst case still ends inside Vercel's 60 seconds: 45 here, Resend's
// 10-second timeout on the last email, then the analytics copy (2 s,
// analytics-server.ts) and the heartbeat (2 s).
const TIME_BUDGET_MS = 45_000;
// No new refresh call starts after this, counted from the refresh's own
// start. Each call stops itself after about 3 seconds (refresh_all_reminders'
// p_budget), so the refresh takes at most about 8 seconds: the most the one
// statement it replaced could take (the 8-second statement limit), so
// sending keeps the time it had.
const REFRESH_BUDGET_MS = 5_000;
const RESEND_TIMEOUT_MS = 10_000;

export type ClaimedReminderRow = {
  reminder_id: string;
  student_id: string;
  kind: ReminderEmailKind;
  occurrence: string;
  email: string;
  card_id: string | null;
  card_name: string | null;
  credit_limit_cents: number | null;
  autopay_status: string;
  payment_due_day: number | null;
  time_zone: string;
  // For the check-ins' buttons (20261126160000_application_check_ins.sql).
  card_application_id?: string | null;
};

function log(event: string, fields: Record<string, unknown>, level: "log" | "error" = "log"): void {
  console[level](JSON.stringify({ event, ...fields }));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type SendOutcome = { ok: true } | { ok: false; status: number | null; code: string };

// The spend limit each claimed statement-closing reminder's card has saved,
// by reminder id: the email's pay-down target, as Home and Updates use it
// (payDownTargetFor). One read; claim_due_reminders does not return it. A
// failed read is logged and the emails use 30% of the credit limit instead.
async function spendLimits(supabase: ServiceClient, rows: ClaimedReminderRow[]): Promise<Map<string, number>> {
  const ids = rows.filter((row) => row.kind === "statement_closing").map((row) => row.reminder_id);
  if (ids.length === 0) return new Map();
  let data: unknown;
  try {
    const read = await supabase.from("reminders").select("id, card_applications(spend_limit_cents)").in("id", ids);
    if (read.error) {
      log("database_error", { operation: "reminder_spend_limits", code: read.error.code }, "error");
      return new Map();
    }
    data = read.data;
  } catch (error) {
    log("database_error", { operation: "reminder_spend_limits", code: error instanceof Error ? error.name : "read_failed" }, "error");
    return new Map();
  }
  const limits = new Map<string, number>();
  // One card per reminder; PostgREST sends it as an object, the generated
  // types as a list, so both are read.
  type Card = { spend_limit_cents: number | null };
  for (const entry of (data ?? []) as unknown as { id: string; card_applications: Card | Card[] | null }[]) {
    const card = Array.isArray(entry.card_applications) ? entry.card_applications[0] : entry.card_applications;
    const cents = card?.spend_limit_cents;
    if (cents !== null && cents !== undefined) limits.set(entry.id, Number(cents));
  }
  return limits;
}

async function sendEmail(
  row: ClaimedReminderRow,
  config: ReminderJobConfig,
  fetchImpl: typeof fetch,
  spendLimitCents: number | null,
): Promise<SendOutcome> {
  const unsubscribeUrl = `${config.appUrl}/api/v1/reminders/unsubscribe?token=${unsubscribeToken(row.student_id, config.unsubscribeSecret)}`;
  const email = buildReminderEmail(
    {
      kind: row.kind,
      occurrence: row.occurrence,
      cardId: row.card_id,
      cardName: row.card_name,
      creditLimitCents: row.credit_limit_cents === null ? null : Number(row.credit_limit_cents),
      spendLimitCents,
      autopayStatus: row.autopay_status,
      paymentDueDay: row.payment_due_day,
      applicationId: row.card_application_id ?? null,
    },
    { appUrl: config.appUrl, unsubscribeUrl },
  );

  let response: Response;
  try {
    response = await fetchImpl(config.resendUrl ?? RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
        // Resend sends one email per key for 24 hours, so a retry after a
        // send that went out but was never marked cannot send it twice.
        "Idempotency-Key": `reminder-${row.reminder_id}`,
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [row.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, status: null, code: error instanceof Error ? error.name : "fetch_failed" };
  }
  if (response.ok) return { ok: true };
  // Resend's error body is { statusCode, name, message }; only the name is
  // logged, as the message can repeat the address.
  const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
  return { ok: false, status: response.status, code: typeof body?.name === "string" ? body.name : "unknown" };
}

export class ReminderJobError extends Error {
  constructor(readonly operation: string, readonly code: string | undefined) {
    super(`${operation} failed`);
  }
}

export async function runReminderJob(
  supabase: ServiceClient,
  config: ReminderJobConfig,
  { startedAt, fetch: fetchImpl = fetch, sleep = defaultSleep, now = Date.now, capture = captureServer }: ReminderJobOptions = {},
): Promise<ReminderJobResult> {
  const started = startedAt ?? now();

  // schedule every card's next cycle first, a few seconds of students per
  // call (each its own statement, inside the database's time limit), until
  // the database answers null. A failure here is logged, not fatal:
  // reminders already due can still go out.
  const refreshStarted = now();
  let after: string | null = null;
  let refreshed = false;
  do {
    const refresh: { data: unknown; error: { code?: string } | null } = await supabase.rpc("refresh_all_reminders", { p_after: after });
    if (refresh.error) {
      log("reminder_refresh_failed", { code: refresh.error.code }, "error");
      break;
    }
    after = (refresh.data as string | null) ?? null;
    refreshed = after === null;
  } while (after !== null && now() - refreshStarted < REFRESH_BUDGET_MS);
  if (!refreshed && after !== null) log("reminder_refresh_incomplete", {}, "error");

  const claim = await supabase.rpc("claim_due_reminders", { p_limit: CLAIM_LIMIT });
  if (claim.error) throw new ReminderJobError("reminder_claim", claim.error.code);
  const rows = (claim.data ?? []) as ClaimedReminderRow[];
  const limits = await spendLimits(supabase, rows);

  const result: ReminderJobResult = { claimed: rows.length, sent: 0, failed: 0, unconfirmed: 0, deferred: 0, abandoned: 0, refreshed };
  const sent: ServerEvent<"reminder_sent">[] = [];

  // Claimable again on the student's next day. True from the database means
  // that was the reminder's last attempt.
  async function release(row: ClaimedReminderRow): Promise<void> {
    const released = await supabase.rpc("release_reminder_claim", { p_reminder_id: row.reminder_id });
    if (released.error) {
      log("database_error", { operation: "reminder_release", code: released.error.code }, "error");
    } else if (released.data === true) {
      result.abandoned += 1;
      log("reminder_abandoned", { kind: row.kind }, "error");
    }
  }

  for (const [index, row] of rows.entries()) {
    if (now() - started > TIME_BUDGET_MS) {
      await release(row);
      result.deferred += 1;
      continue;
    }
    if (index > 0) await sleep(SEND_INTERVAL_MS);

    let outcome: SendOutcome;
    try {
      outcome = await sendEmail(row, config, fetchImpl, limits.get(row.reminder_id) ?? null);
    } catch (error) {
      // building the email failed (unexpected data); nothing was sent
      outcome = { ok: false, status: null, code: error instanceof Error ? error.name : "build_failed" };
    }

    if (!outcome.ok) {
      log("reminder_send_failed", { kind: row.kind, status: outcome.status, code: outcome.code }, "error");
      await release(row);
      result.failed += 1;
      continue;
    }

    // marked sent, tried twice so a passing blip does not leave it unconfirmed
    let marked = await supabase.rpc("mark_reminder_sent", { p_reminder_id: row.reminder_id });
    if (marked.error) marked = await supabase.rpc("mark_reminder_sent", { p_reminder_id: row.reminder_id });
    if (marked.error || marked.data !== true) {
      log("reminder_mark_sent_failed", { code: marked.error?.code ?? "not_marked" }, "error");
      result.unconfirmed += 1;
      continue;
    }
    result.sent += 1;
    // A copy of the row now marked sent (S46): the row id is the event id.
    sent.push({ event: "reminder_sent", studentId: row.student_id, properties: { kind: row.kind }, uuid: row.reminder_id });
  }

  // one profile read for every student sent to; never fails the run
  await capture(await withAnalyticsOn(supabase, sent));
  log("reminder_job", { ...result });
  return result;
}
