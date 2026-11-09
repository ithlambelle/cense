// Created with Claude Code (2026-11-08). In-app reminders (US-08, Flow B), as
// a real signed-in student on the local stack: a sent reminder is a card in
// Updates (N1) opened from the email's Open Cense; I paid it down, Mark all
// read, Snooze (N2) to the Snoozed screen (N4), Dismiss for this billing
// cycle, and the follow-up 2 days after the close (N3). Each step is reloaded
// to show it was saved. Another student's reminder is out of reach.
//
// Reminders are written straight into the local database as "sent" with the
// stack's service role key (web/.env.local, as in CI), the same rows the
// daily job leaves after an email goes; the follow-up is raised by the job's
// own function.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { calendarDate } from "../src/lib/api/reminders";
import { daysBetween, monthDay, weekdayName } from "../src/lib/reminders/in-app";
import { addDays } from "../src/lib/reminders/schedule";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };
const NY = "America/New_York";

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

const today = () => calendarDate(new Date().toISOString(), NY);

// "Fri" within a week, else "Dec 4": how a card names a closing date.
const near = (date: string) => (Math.abs(daysBetween(today(), date)) <= 6 ? weekdayName(date) : monthDay(date));

// A new student with one approved card ($500 limit, no days saved, so the
// scheduler adds nothing of its own), on Updates.
async function studentWithCard(page: Page, journey: string, paymentDueDay?: number) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  const created = await page.request.post("/api/v1/applications", { data: { ...DISCOVER, status: "approved", creditLimitCents: 50000 } });
  expect(created.status(), await created.text()).toBe(201);
  const applicationId = ((await created.json()) as { id: string }).id;
  const studentId = ((await (await page.request.get("/api/v1/me")).json()) as { id: string }).id;
  if (paymentDueDay) {
    const { error } = await service().from("card_applications").update({ payment_due_day: paymentDueDay }).eq("id", applicationId);
    expect(error).toBeNull();
  }
  return { applicationId, studentId, checkA11y };
}

// A reminder whose email went out an hour ago, about `occurrence`.
async function sentReminder(studentId: string, applicationId: string, kind: string, occurrence: string): Promise<string> {
  const sentAt = new Date(Date.now() - 3_600_000).toISOString();
  const { data, error } = await service()
    .from("reminders")
    .insert({ student_id: studentId, card_application_id: applicationId, kind, occurrence, due_at: sentAt, claimed_at: sentAt, attempted_at: sentAt, attempts: 1, sent_at: sentAt })
    .select("id")
    .single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

const group = (page: Page, name: string) => page.getByRole("region", { name });
const card = (page: Page, title: string | RegExp) => page.getByRole("article", { name: title });

test("the email's Open Cense opens Updates with the reminder as a card; I paid it down and Mark all read are saved", async ({ page }) => {
  const { applicationId, studentId, checkA11y } = await studentWithCard(page, "updates-paid");
  const closes = addDays(today(), 4);
  await sentReminder(studentId, applicationId, "statement_closing", closes);
  await sentReminder(studentId, applicationId, "payment_due", addDays(today(), 12));

  await page.goto("/updates?reminder=statement_closing");
  // The mark is dropped from the address once counted.
  await expect(page).toHaveURL(/\/updates$/);
  const statement = card(page, `Statement closes ${near(closes)}`);
  await expect(group(page, "New").getByRole("article")).toHaveCount(2);
  await expect(statement.getByText("Pay down to $150 or less.")).toHaveClass(/ph-sensitive/);
  await expect(statement.getByRole("button", { name: "I paid it down" })).toBeVisible();
  await expect(statement.getByRole("button", { name: /^Snooze/ })).toBeVisible();
  await checkA11y("updates");

  await statement.getByRole("button", { name: "I paid it down" }).click();
  await expect(group(page, "Earlier").getByRole("article", { name: `Statement closes ${near(closes)}` })).toBeVisible();
  await expect(statement.getByText("You marked it paid.")).toBeVisible();
  await expect(statement.getByRole("button")).toHaveCount(0);
  await page.reload();
  await expect(group(page, "Earlier").getByText("You marked it paid.")).toBeVisible();

  // Profile counts the one still New, and See all opens Updates.
  await page.goto("/settings");
  const updates = page.getByRole("region", { name: "Updates" });
  await expect(updates.getByText("1 new")).toBeVisible();
  await updates.getByRole("link", { name: /^See all/ }).click();
  await expect(page).toHaveURL(/\/updates$/);

  // Mark all read moves the other card to Earlier, with its actions kept, and the chip goes.
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(group(page, "New")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
  await page.reload();
  const due = card(page, `Payment due ${monthDay(addDays(today(), 12))}`);
  await expect(group(page, "Earlier").getByRole("article")).toHaveCount(2);
  await expect(due.getByRole("button", { name: "I paid it" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Updates" }).getByText(/ new$/)).toHaveCount(0);

  // Home's bell opens Updates.
  await page.goto("/home");
  await page.getByRole("link", { name: "Updates" }).click();
  await expect(page).toHaveURL(/\/updates$/);
});

test("Snooze offers times up to the due date, saves, shows when it comes back, and survives a reload", async ({ page }) => {
  const { applicationId, studentId, checkA11y } = await studentWithCard(page, "updates-snooze");
  const closes = addDays(today(), 6);
  const id = await sentReminder(studentId, applicationId, "statement_closing", closes);
  const soon = await sentReminder(studentId, applicationId, "payment_due", addDays(today(), 1));

  await page.goto("/updates");
  await card(page, `Statement closes ${near(closes)}`).getByRole("button", { name: /^Snooze/ }).click();
  const sheet = page.getByRole("dialog", { name: "Remind me again" });
  const options = sheet.getByRole("radio");
  await expect(options).toHaveText(["Tomorrow morning", "In 2 days", "The day before it is due"]);
  await expect(options.first()).toHaveAttribute("aria-checked", "true");
  await checkA11y("snooze sheet");
  await sheet.getByRole("radio", { name: "In 2 days" }).click();
  await expect(sheet.getByRole("radio", { name: "In 2 days" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Snooze", exact: true }).click();

  const back = weekdayName(addDays(today(), 2));
  await expect(page).toHaveURL(new RegExp(`/updates/${id}/snoozed$`));
  await expect(page.getByRole("heading", { level: 1, name: `Snoozed until ${back}` })).toBeVisible();
  await expect(page.getByText(`${back}, 9 AM`)).toBeVisible();
  await expect(page.getByText("Statement closes", { exact: true })).toBeVisible();
  await checkA11y("snoozed");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `Snoozed until ${back}` })).toBeVisible();

  // The button, not the back arrow (both go to Updates).
  await page.getByRole("main").getByRole("link", { name: "Back to Updates" }).click();
  await expect(page).toHaveURL(/\/updates$/);
  const snoozed = group(page, "Snoozed").getByRole("article", { name: `Statement closes ${near(closes)}` });
  await expect(snoozed.getByText(`Snoozed until ${back}.`)).toBeVisible();
  await expect(snoozed.getByRole("button")).toHaveCount(0);

  // Due tomorrow: only tomorrow morning is offered, and the API refuses later.
  await card(page, /^Payment due/).getByRole("button", { name: /^Snooze/ }).click();
  await expect(page.getByRole("dialog", { name: "Remind me again" }).getByRole("radio")).toHaveText(["Tomorrow morning"]);
  await page.keyboard.press("Escape");
  const late = await page.request.post(`/api/v1/reminders/${soon}/snooze`, { data: { choice: "in_2_days" } });
  expect(late.status()).toBe(409);
  expect(((await late.json()) as { error: { code: string } }).error.code).toBe("past_due");
  const bad = await page.request.post(`/api/v1/reminders/${soon}/snooze`, { data: { choice: "next_year" } });
  expect(bad.status()).toBe(400);
});

test("Dismiss for this billing cycle hides the reminder for good", async ({ page }) => {
  const { applicationId, studentId } = await studentWithCard(page, "updates-dismiss");
  const closes = addDays(today(), 5);
  await sentReminder(studentId, applicationId, "statement_closing", closes);

  await page.goto("/updates");
  await card(page, `Statement closes ${near(closes)}`).getByRole("button", { name: /^Snooze/ }).click();
  await page.getByRole("dialog", { name: "Remind me again" }).getByRole("button", { name: "Dismiss for this billing cycle" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("No updates yet.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("2 days after the close, an unpaid statement gets one follow-up that opens its own screen", async ({ page }) => {
  const dueDate = addDays(today(), 10);
  const { applicationId, studentId, checkA11y } = await studentWithCard(page, "updates-follow-up", Number(dueDate.slice(8)));
  const closed = addDays(today(), -2);
  const id = await sentReminder(studentId, applicationId, "statement_closing", closed);

  // The daily job's follow-up step.
  const { error } = await service().rpc("raise_reminder_follow_ups");
  expect(error).toBeNull();
  const first = await service().from("reminders").select("follow_up_at").eq("id", id).single();
  expect(first.data?.follow_up_at).not.toBeNull();
  await service().rpc("raise_reminder_follow_ups");
  const second = await service().from("reminders").select("follow_up_at").eq("id", id).single();
  expect(second.data?.follow_up_at).toBe(first.data?.follow_up_at);

  await page.goto("/updates");
  const followUp = group(page, "New").getByRole("article", { name: "Time to pay off your card" });
  await expect(followUp.getByText(`Statement closed ${near(closed)}. Pay the full balance by ${monthDay(dueDate)}.`)).toBeVisible();
  await followUp.getByRole("link", { name: "Time to pay off your card" }).click();

  await expect(page).toHaveURL(new RegExp(`/updates/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Time to pay off your card" })).toBeVisible();
  await expect(page.getByText(`Paying it in full by ${monthDay(dueDate)} avoids interest.`)).toBeVisible();
  await expect(page.getByText(`${DISCOVER.cardName} · Due ${monthDay(dueDate)}`)).toHaveClass(/ph-sensitive/);
  await checkA11y("follow-up");
  await page.getByRole("button", { name: "Snooze" }).click();
  await expect(page.getByRole("dialog", { name: "Remind me again" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "I paid it" }).click();
  await expect(page).toHaveURL(/\/updates$/);
  await expect(group(page, "Earlier").getByRole("article", { name: "Time to pay off your card" }).getByText("You marked it paid.")).toBeVisible();
  // Done: its screen now returns to Updates.
  await page.goto(`/updates/${id}`);
  await expect(page).toHaveURL(/\/updates$/);
});

test("another student's reminder cannot be snoozed, dismissed or opened", async ({ page, browser }) => {
  const { applicationId, studentId } = await studentWithCard(page, "updates-owner");
  const theirs = await sentReminder(studentId, applicationId, "statement_closing", addDays(today(), 4));

  const other = await browser.newPage();
  await blockExternalRequests(other.context());
  await signUp(other, uniqueEmail("updates-intruder"), async () => {});
  expect((await other.request.post(`/api/v1/reminders/${theirs}/snooze`, { data: { choice: "tomorrow" } })).status()).toBe(404);
  expect((await other.request.post(`/api/v1/reminders/${theirs}/dismiss`)).status()).toBe(404);
  expect((await other.request.post(`/api/v1/reminders/${theirs}/acted`)).status()).toBe(404);
  await other.goto(`/updates/${theirs}`);
  await expect(other).toHaveURL(/\/updates$/);
  await other.goto(`/updates/${theirs}/snoozed`);
  await expect(other).toHaveURL(/\/updates$/);
  await expect(other.getByRole("article")).toHaveCount(0);
  await other.close();

  // The owner's reminder is untouched.
  const row = await service().from("reminders").select("snoozed_until, dismissed_at, acted_at").eq("id", theirs).single();
  expect(row.data).toEqual({ snoozed_until: null, dismissed_at: null, acted_at: null });
});
