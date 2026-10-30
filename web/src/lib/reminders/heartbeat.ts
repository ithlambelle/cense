import "server-only";

// The daily reminder job's alarm (Reminders audit R-06). Every authorized run
// pings the check at REMINDER_HEARTBEAT_URL, a Healthchecks.io ping address
// (set up as in the README): "/start" when it begins, the address itself when
// it finishes with nothing failed, "/fail" when a send failed or the job could
// not run. The check emails the team on a fail, and when no finished run comes
// in within a day plus its grace time, which is how a job that stopped
// running (a missing cron, a missing CRON_SECRET) is noticed.
//
// With the variable unset nothing is pinged and nothing alerts. The body is
// the run's counts or the error's name, never anything about a student. The
// address itself is never logged: anyone who has it can ping the check. Each
// ping gives up after 2 seconds, so the alarm can never use up the job's time
// (Vercel stops the function at 60 seconds).

export type HeartbeatSignal = "start" | "success" | "fail";

export const HEARTBEAT_TIMEOUT_MS = 2_000;

function log(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event: "reminder_heartbeat_failed", ...fields }));
}

export async function pingHeartbeat(
  signal: HeartbeatSignal,
  body?: Record<string, unknown>,
  { url = process.env.REMINDER_HEARTBEAT_URL, fetch: fetchImpl = fetch }: { url?: string; fetch?: typeof fetch } = {},
): Promise<void> {
  const base = url?.trim().replace(/\/+$/, "");
  if (!base) return;
  if (!/^https?:\/\//.test(base)) {
    log({ code: "not_an_address" });
    return;
  }
  try {
    const response = await fetchImpl(signal === "success" ? base : `${base}/${signal}`, {
      method: "POST",
      // Healthchecks keeps the body with the ping and shows it in the alert.
      headers: { "Content-Type": "text/plain" },
      body: body ? JSON.stringify(body) : "",
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });
    if (!response.ok) log({ signal, status: response.status });
  } catch (error) {
    log({ signal, status: null, code: error instanceof Error ? error.name : "fetch_failed" });
  }
}
