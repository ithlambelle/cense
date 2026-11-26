// Created with Claude Code (2026-11-26). Home, Updates and Reminder settings
// for a card with autopay on the full statement balance and a $100 spend
// limit, as a real signed-up student on the local stack (persona walk, Nov
// 25): no "Time to pay off your card" for that card, Reminder settings say the
// due-date email is skipped, the saved $100 is what Home pays down to and what
// the spend limit reopens on, Home stops saying "Your first month" once every
// star is lit, and a second card opens its own setup list, never /plan.
//
// The statement reminder is written straight into the local database as
// "sent" with the stack's service role key (web/.env.local), and the
// follow-up job is run with it, as updates.spec.ts does.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { calendarDate } from "../src/lib/api/reminders";
import { monthDay } from "../src/lib/reminders/in-app";
import { addDays, nextOnDay } from "../src/lib/reminders/schedule";

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
const dayOf = (date: string) => String(Number(date.slice(8)));

async function setUpAutopay(page: Page, id: string) {
  // card-setup.spec.ts walks the issuer's steps; this starts at "Did you turn on autopay?".
  await page.goto(`/applications/${id}/setup/autopay/confirm`);
  await expect(page.getByRole("heading", { level: 1, name: "Did you turn on autopay?" })).toBeVisible();
  await page.getByRole("radio", { name: "Yes, the full statement balance" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay/on$`));
}

test("autopay on the full balance and a $100 limit: Home, Updates and Reminder settings agree, and a second card opens its setup", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("autopay-limit"), checkA11y);
  const created = await page.request.post("/api/v1/applications", { data: { ...DISCOVER, status: "approved", creditLimitCents: 100000 } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  const studentId = ((await (await page.request.get("/api/v1/me")).json()) as { id: string }).id;

  // The setup list heads its steps without a count, not "Three steps" over
  // four rows, and links to the card's own page.
  await page.goto(`/applications/${id}/setup`);
  await expect(page.getByRole("heading", { level: 2, name: "Your steps" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Card details" })).toHaveAttribute("href", `/cards/${DISCOVER.cardId}`);
  await expect(page.getByText("Three steps")).toHaveCount(0);

  await setUpAutopay(page, id);

  // The card's days, from the setup list's dates row.
  const closes = addDays(today(), 4);
  const due = addDays(today(), 20);
  await page.goto(`/applications/${id}/setup`);
  await page.getByRole("link", { name: /^Add your dates/ }).click();
  await page.getByLabel("Statement closes on day").fill(dayOf(closes));
  await page.getByLabel("Payment due on day").fill(dayOf(due));
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup$`));

  // $100 of $1,000: the over-30% fact shows only while the amount is over $300.
  await page.getByRole("link", { name: /^Set a spend limit/ }).click();
  await page.getByRole("link", { name: "Pick my own" }).click();
  await expect(page.getByText("Above $300")).toHaveCount(0);
  const other = page.getByLabel("Another amount");
  await other.fill("400");
  await expect(page.getByText("Above $300")).toBeVisible();
  await other.fill("100");
  await expect(page.getByText("Above $300")).toHaveCount(0);
  await page.getByRole("button", { name: "Save my limit" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup$`));
  // Reopening the spend limit opens on the saved $100, not the $300 suggestion.
  await page.getByRole("link", { name: /^Set a spend limit/ }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit/pick$`));
  await expect(page.getByLabel("Another amount")).toHaveValue("100");
  await expect(page.getByText("Above $300")).toHaveCount(0);

  // Home: every star is lit, so the card shows as set up, with the saved
  // limit and the next statement, and Coming up pays down to $100.
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.cardName });
  await expect(card.getByText("Set up", { exact: true })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Your first month" })).toHaveCount(0);
  await expect(page.getByText(/stars lit/)).toHaveCount(0);
  await expect(card.getByText("$100 a month")).toBeVisible();
  await expect(card.getByText(monthDay(nextOnDay(Number(dayOf(closes)), today())))).toBeVisible();
  const comingUp = page.getByRole("list", { name: "Coming up" });
  await expect(comingUp).toContainText(`${monthDay(closes)}  Statement closes`);
  await expect(comingUp).toContainText("pay down to $100");
  await expect(comingUp).not.toContainText("$300");
  await checkA11y("home: card set up");
  await page.reload();
  await expect(card.getByText("$100 a month")).toBeVisible();
  await expect(card.getByRole("heading", { name: "Your first month" })).toHaveCount(0);
  // The title row still opens the setup list, where any step can change.
  await card.getByRole("link", { name: "Set up your card" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup$`));

  // A statement that closed 2 days ago, its email sent and not marked paid:
  // the follow-up job raises nothing for this card, and Updates never asks
  // "I paid it" for it.
  const closed = addDays(today(), -2);
  const sentAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const inserted = await service()
    .from("reminders")
    .insert({ student_id: studentId, card_application_id: id, kind: "statement_closing", occurrence: closed, due_at: sentAt, claimed_at: sentAt, attempted_at: sentAt, attempts: 1, sent_at: sentAt })
    .select("id")
    .single();
  expect(inserted.error).toBeNull();
  const reminderId = (inserted.data as { id: string }).id;
  expect((await service().rpc("raise_reminder_follow_ups")).error).toBeNull();
  const row = await service().from("reminders").select("follow_up_at").eq("id", reminderId).single();
  expect(row.data?.follow_up_at).toBeNull();
  await page.goto("/updates");
  await expect(page.getByRole("heading", { level: 1, name: "Updates" })).toBeVisible();
  await expect(page.getByText("Time to pay off your card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I paid it" })).toHaveCount(0);
  // Its follow-up screen, typed in, goes back to Updates.
  await page.goto(`/updates/${reminderId}`);
  await expect(page).toHaveURL(/\/updates$/);

  // Reminder settings say the due-date email is skipped while autopay is on.
  await page.goto("/settings/reminders");
  await expect(page.getByText("Skipped while autopay is on")).toBeVisible();
  await checkA11y("reminder settings: autopay on");

  // A second card, added as one the student already has.
  await page.goto("/home/add-card");
  await page.getByLabel("Card name").fill("Chase Freedom Rise");
  await page.getByLabel("Credit limit (optional)").fill("1500");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/home/add-card");
  await page.goto("/home");
  // Whichever card leads, the other opens its own setup list, never /plan.
  await expect(page.getByRole("heading", { name: "Your other cards" })).toBeVisible();
  await expect(page.locator('a[href^="/plan"]')).toHaveCount(0);
  const listed = page.getByRole("region", { name: "Your other cards" }).getByRole("link");
  await expect(listed).toHaveCount(1);
  const href = await listed.getAttribute("href");
  expect(href).toMatch(/^\/applications\/[0-9a-f-]{36}\/setup$/);
  await listed.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1, name: /^Set up your/ })).toBeVisible();

  // An old /plan link opens that card's setup list.
  const second = href!.split("/")[2];
  await page.goto(`/plan?application=${second}`);
  await expect(page).toHaveURL(new RegExp(`/applications/${second}/setup$`));
});
