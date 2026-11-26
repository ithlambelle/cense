// Created with Claude Code (2026-11-26). The check-ins while a student waits
// on an issuer (20261126160000_application_check_ins.sql), end to end on the
// local stack as a real signed-up student: they mark "I applied", the
// applied date is moved back 7 days in the database (the stack's service
// role key, web/.env.local, as updates.spec.ts does), the daily job runs with
// the cron secret, and the student gets "Heard back yet?" in Updates and by
// email (the Resend stand-in on :3598, support/fake-email-server.ts, as in
// reminder-job.spec.ts), then answers from the email's own button. The
// letter check-in the same way, 10 days after a denial waiting on the letter.
//
// The app must be started with the job's variables (README, "Run the app and
// journey tests locally"). Locally, without E2E_CRON_SECRET, this file is
// skipped; in CI it is required.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { calendarDate } from "../src/lib/api/reminders";
import { addDays } from "../src/lib/reminders/schedule";

import { blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { startFakeEmailServer } from "./support/fake-email-server";

const SECRET = process.env.E2E_CRON_SECRET;
const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };
const NY = "America/New_York";

test.describe.configure({ mode: "serial" });
test.skip(!SECRET && !process.env.CI, "Start the app with the reminder job's variables and set E2E_CRON_SECRET (README).");

let fake: Awaited<ReturnType<typeof startFakeEmailServer>>;

test.beforeAll(async () => {
  if (!SECRET) throw new Error("E2E_CRON_SECRET is not set: CI must run the check-in journey.");
  fake = await startFakeEmailServer();
});

test.afterAll(async () => {
  await fake?.close();
});

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

function service() {
  let file = "";
  try {
    file = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  } catch {}
  const read = (name: string) => process.env[name] ?? new RegExp(`^${name}=(.*)$`, "m").exec(file)?.[1]?.trim();
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const key = read("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Set the local stack's URL and service role key in web/.env.local (README).");
  if (new URL(url).hostname !== "127.0.0.1") throw new Error(`Refusing to run: ${url} is not the local stack.`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Noon on New York's calendar `days` ago (every student is on it: no time
// zone is saved yet).
function daysAgo(days: number): string {
  const day = addDays(calendarDate(new Date().toISOString(), NY), -days);
  return new Date(`${day}T17:00:00Z`).toISOString();
}

// What Vercel Cron does once a day.
async function runJob(request: APIRequestContext) {
  const response = await request.get("/api/v1/cron/reminders", { headers: { Authorization: `Bearer ${SECRET}` } });
  expect(response.status(), await response.text()).toBe(200);
}

const pathOf = (link: string) => {
  const url = new URL(link.replaceAll("&amp;", "&"));
  return url.pathname + url.search;
};

function buttons(html: string): Record<string, string> {
  return Object.fromEntries(
    [...html.matchAll(/<a href="([^"]+)" style="display:inline-block[^"]*">([^<]+)<\/a>/g)].map(([, href, label]) => [
      label.replace("&#39;", "'"),
      pathOf(href),
    ]),
  );
}

async function applied(page: Page, journey: string) {
  const email = uniqueEmail(journey);
  await signUp(page, email, async () => {});
  const created = await page.request.post("/api/v1/applications", { data: { ...DISCOVER, status: "applied" } });
  expect(created.status(), await created.text()).toBe(201);
  return { email, id: ((await created.json()) as { id: string }).id };
}

test("a week after I applied: Heard back yet? in Updates and by email, answered from the email", async ({ page, request }) => {
  const { email, id } = await applied(page, "check-in-heard");

  // Day 6: nothing yet.
  const sixDays = await service().from("card_applications").update({ applied_at: daysAgo(6) }).eq("id", id);
  expect(sixDays.error).toBeNull();
  await runJob(request);
  expect(fake.emailsTo(email)).toEqual([]);

  // Day 7: one email, and the same check-in in Updates.
  const sevenDays = await service().from("card_applications").update({ applied_at: daysAgo(7) }).eq("id", id);
  expect(sevenDays.error).toBeNull();
  await runJob(request);
  const [sent, ...more] = fake.emailsTo(email);
  expect(more).toEqual([]);
  expect(sent.subject).toBe("Heard back yet?");
  expect(sent.text).toContain("Has the issuer decided on your Discover it Student Cash Back application?");
  const links = buttons(sent.html);
  expect(links).toEqual({
    "I was approved": `/applications/${id}?choice=approved&reminder=heard_back`,
    "I was denied": `/applications/${id}?choice=denied&reminder=heard_back`,
    "I haven't heard yet": `/applications/${id}/waiting?reminder=heard_back`,
  });

  // The job again the same day: no second email.
  await runJob(request);
  expect(fake.emailsTo(email)).toHaveLength(1);

  await page.goto("/updates");
  const checkIn = page.getByRole("region", { name: "New" }).getByRole("article", { name: "Heard back yet?" });
  await expect(checkIn.getByText("Discover it Student Cash Back: tell us what the issuer decided.")).toBeVisible();
  await expect(checkIn.getByRole("link", { name: "Tell us" })).toHaveAttribute("href", `/applications/${id}`);

  // "I haven't heard yet" opens the waiting screen, with the mark dropped.
  await page.goto(links["I haven't heard yet"]);
  await expect(page.getByRole("heading", { level: 1, name: "Still waiting is normal" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/waiting$`));

  // "I was approved" opens Mark result with that answer picked; saving it
  // records the decision.
  await page.goto(links["I was approved"]);
  await expect(page.getByRole("heading", { level: 1, name: "What did the issuer decide?" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}\\?choice=approved$`));
  await expect(page.getByRole("button", { name: "I was approved" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Credit limit (optional)").fill("500");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL((url) => url.pathname === "/home");
  const saved = await page.request.get(`/api/v1/applications/${id}`);
  expect(await saved.json()).toMatchObject({ status: "approved", creditLimitCents: 50000 });

  // The check-in is done: under Earlier, with no action, after a reload too.
  await page.goto("/updates");
  await page.reload();
  const done = page.getByRole("region", { name: "Earlier" }).getByRole("article", { name: "Heard back yet?" });
  await expect(done.getByText("You told us what they decided.")).toBeVisible();
  await expect(done.getByRole("link")).toHaveCount(0);

  // Day 21 would have sent the second; a decided application gets none.
  const late = await service().from("card_applications").update({ applied_at: daysAgo(21) }).eq("id", id);
  expect(late.error).toBeNull();
  await runJob(request);
  expect(fake.emailsTo(email)).toHaveLength(1);
});

test("10 days after a denial waiting on the letter: Has your letter come?, once", async ({ page, request }) => {
  const { email, id } = await applied(page, "check-in-letter");
  for (const data of [{ status: "rejected" }, { denialReason: "no_letter_yet" }]) {
    const saved = await page.request.patch(`/api/v1/applications/${id}`, { data });
    expect(saved.status(), await saved.text()).toBe(200);
  }
  // The denial time cannot be moved back (set_rejected_at keeps the first
  // one), so the planned check-in's own day is moved to today instead.
  const db = service();
  const planned = await db.from("reminders").select("id, occurrence").eq("card_application_id", id).eq("kind", "letter_check").single();
  expect(planned.error).toBeNull();
  expect(planned.data!.occurrence).toBe(addDays(calendarDate(new Date().toISOString(), NY), 10));
  const today = calendarDate(new Date().toISOString(), NY);
  const moved = await db.from("reminders").update({ occurrence: today, due_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", planned.data!.id);
  expect(moved.error).toBeNull();

  await runJob(request);
  const [sent, ...more] = fake.emailsTo(email);
  expect(more).toEqual([]);
  expect(sent.subject).toBe("Has your letter come?");
  const link = buttons(sent.html)["I got my letter"];
  expect(link).toBe(`/denied?application=${id}&reminder=letter_check`);

  // The button opens the reason question for this card, where the student
  // records what the letter says.
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`/denied\\?application=${id}$`));
  await expect(page.getByRole("heading", { name: "Did the issuer tell you why?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, I know the reason" }).click();
  await page.getByRole("button", { name: "Not enough income" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/denied/plan");

  // Once the reason is saved, the check-in is done and never comes again.
  await page.goto("/updates");
  await expect(page.getByRole("article", { name: "Has your letter come?" }).getByText("You told us your letter came.")).toBeVisible();
  const again = await page.request.patch(`/api/v1/applications/${id}`, { data: { denialReason: "no_letter_yet" } });
  expect(again.status()).toBe(200);
  const rows = await db.from("reminders").select("id").eq("card_application_id", id).eq("kind", "letter_check");
  expect(rows.data).toHaveLength(1);
});
