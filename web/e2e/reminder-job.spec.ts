// The daily reminder job end to end (Reminders audit R-16), on the local
// stack: real students set up reminders, the cron route runs against the real
// database, and Resend and the heartbeat check are a stand-in on :3598
// (support/fake-email-server.ts), never the real API. Then the student uses
// the email they got: its Open Cense button, Reminder settings link and
// one-click unsubscribe.
//
// The app must be started with the job's variables (README, "Run the app and
// journey tests locally"; CI does this). Locally, without E2E_CRON_SECRET,
// this file is skipped; in CI it is required.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { startFakeEmailServer } from "./support/fake-email-server";

const SECRET = process.env.E2E_CRON_SECRET;
const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.describe.configure({ mode: "serial" });
test.skip(!SECRET && !process.env.CI, "Start the app with the reminder job's variables and set E2E_CRON_SECRET (README).");

let fake: Awaited<ReturnType<typeof startFakeEmailServer>>;

test.beforeAll(async () => {
  if (!SECRET) throw new Error("E2E_CRON_SECRET is not set: CI must run the reminder job test.");
  fake = await startFakeEmailServer();
});

test.afterAll(async () => {
  await fake?.close();
});

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// A day of the month `days` from today, and its weekday, on New York's
// calendar (every student is on it: no time zone is saved yet).
function newYorkDay(days: number): { day: number; weekday: string } {
  const date = new Date(Date.now() + days * 86_400_000);
  return {
    day: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(date)),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date),
  };
}

// What Vercel Cron does once a day.
async function runJob(request: APIRequestContext) {
  const response = await request.get("/api/v1/cron/reminders", { headers: { Authorization: `Bearer ${SECRET}` } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Record<string, number>;
}

// A new student with an approved card they already had, whose statement
// closes in 2 days: its closing reminder is due today.
async function studentWithReminderDueToday(page: Page, journey: string) {
  const email = uniqueEmail(journey);
  await signUp(page, email, async () => {});
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "approved", creditLimitCents: 50000 },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  return { email, id };
}

async function reminders(page: Page) {
  const response = await page.request.get("/api/v1/reminders");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { reminders: { kind: string; sentAt: string | null }[] }).reminders;
}

const pathOf = (link: string) => {
  const url = new URL(link);
  return url.pathname + url.search;
};

test("the job emails a due reminder once, and the email's button, settings link and unsubscribe work", async ({ page, request }) => {
  const closes = newYorkDay(2);
  const { email, id } = await studentWithReminderDueToday(page, "job-sent");

  // The student saves the days on the reminder screen, as from Home.
  await page.goto(`/applications/${id}/reminders`);
  await page.getByLabel("Statement closes on day").fill(String(closes.day));
  await page.getByLabel("Payment due on day").fill(String(newYorkDay(15).day));
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // A caller without the secret is refused and pings nothing.
  expect((await request.get("/api/v1/cron/reminders")).status()).toBe(401);
  expect(fake.pings).toEqual([]);

  const first = await runJob(request);
  expect(first.sent).toBeGreaterThanOrEqual(1);
  expect(first.failed).toBe(0);

  const [sent, ...more] = fake.emailsTo(email);
  expect(more).toEqual([]);
  expect(sent.subject).toBe(`Your statement closes ${closes.weekday}. Quick move?`);
  // The job's variables as CI and the README start the app with them.
  expect(sent.from).toBe("Cense <reminders@example.test>");
  expect(sent.idempotencyKey).toMatch(/^reminder-[0-9a-f-]{36}$/);
  expect(sent.authorization).toBe("Bearer e2e-placeholder");
  expect(sent.text).toContain("pay it down to $150 or less in your Discover app");
  // One button, Open Cense, to Home marked with the email's kind; the footer
  // opens Reminder settings.
  const buttons = [...sent.html.matchAll(/<a href="([^"]+)" style="display:inline-block[^"]*">([^<]+)<\/a>/g)];
  expect(buttons.map(([, , label]) => label)).toEqual(["Open Cense"]);
  const openCense = buttons[0][1];
  expect(pathOf(openCense)).toBe("/home?reminder=statement_closing");
  const settingsLink = /<a href="([^"]+)"[^>]*>Reminder settings<\/a>/.exec(sent.html)?.[1];
  expect(settingsLink && pathOf(settingsLink)).toBe("/settings/reminders");

  // The student sees it as sent; the heartbeat saw a clean run with counts only.
  expect((await reminders(page)).find((r) => r.kind === "statement_closing")?.sentAt).not.toBeNull();
  expect(fake.pings.map((ping) => ping.path)).toEqual(["/heartbeat/start", "/heartbeat"]);
  expect(JSON.parse(fake.pings[1].body)).toMatchObject({ sent: first.sent, failed: 0, abandoned: 0 });
  expect(fake.pings.map((ping) => ping.body).join()).not.toContain(email);

  // The job again the same day (Ben's runbook: run it by hand): no second email.
  await runJob(request);
  expect(fake.emailsTo(email)).toHaveLength(1);

  // Open Cense: Home, with the mark dropped from the address.
  await page.goto(pathOf(openCense));
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("region", { name: DISCOVER.name })).toBeVisible();

  // The footer link opens Reminder settings, all on.
  await page.goto(pathOf(settingsLink!));
  await expect(page.getByRole("heading", { level: 1, name: "Reminder settings" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Payment due" })).toHaveAttribute("aria-checked", "true");

  // The inbox's one-click unsubscribe (RFC 8058) turns every email off...
  const unsubscribe = /^<(.+)>$/.exec(sent.headers["List-Unsubscribe"])![1];
  const oneClick = await request.post(pathOf(unsubscribe), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: "List-Unsubscribe=One-Click",
  });
  expect(oneClick.status()).toBe(200);
  expect(await oneClick.text()).toContain('href="/settings/reminders"');
  await page.reload();
  await expect(page.getByText("Reminders are off. We won’t email you about your cards.")).toBeVisible();
  // ...and Reminder settings turns them back on, each kind as it was.
  await page.getByRole("button", { name: "Turn reminders back on" }).click();
  await expect(page.getByRole("switch", { name: "Payment due" })).toHaveAttribute("aria-checked", "true");
  const settings = await page.request.get("/api/v1/me/reminder-settings");
  expect(await settings.json()).toEqual({ emailsOn: true, statementClosing: true, paymentDue: true, checkAutopay: true });
});

test("a failed send is tried once a day, not on every run, and the heartbeat reports the failure", async ({ page, request }) => {
  const { email, id } = await studentWithReminderDueToday(page, "job-failed");
  fake.fail(email);
  const days = await page.request.patch(`/api/v1/applications/${id}`, {
    data: { statementClosingDay: newYorkDay(2).day, paymentDueDay: newYorkDay(15).day },
  });
  expect(days.status()).toBe(200);
  fake.pings.length = 0;

  const first = await runJob(request);
  expect(first.failed).toBeGreaterThanOrEqual(1);
  expect(fake.attemptsTo(email)).toBe(1);
  expect(fake.pings.map((ping) => ping.path)).toEqual(["/heartbeat/start", "/heartbeat/fail"]);
  expect(JSON.parse(fake.pings[1].body)).toMatchObject({ failed: first.failed });
  expect(fake.pings[1].body).not.toContain(email);

  // Run again by hand, twice: the failed reminder waits for tomorrow instead
  // of using up its 3 attempts in a minute (Reminders audit R-07).
  fake.pings.length = 0;
  await runJob(request);
  await runJob(request);
  expect(fake.attemptsTo(email)).toBe(1);
  expect(fake.pings.map((ping) => ping.path)).toEqual(["/heartbeat/start", "/heartbeat", "/heartbeat/start", "/heartbeat"]);
  expect((await reminders(page)).find((r) => r.kind === "statement_closing")?.sentAt).toBeNull();
});
