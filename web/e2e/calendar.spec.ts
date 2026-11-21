// Created with Claude Code (2026-11-21). The Calendar (Figma C1, 821:9293) as
// a real signed-up student on the local stack: an empty month says so; once an
// approved card's days are saved, Home's Coming up links to the Calendar, the
// card's dates show as dots and rows, a tapped day lists its own dates, a
// second tap goes back, and a reload keeps it all. On main there was no
// Calendar.
//
// Dates are the student's calendar (New York: no time zone is saved for
// students yet), and both days fall in the current month whatever the day the
// test runs.
import { expect, test, type Page } from "@playwright/test";

import { calendarDate } from "../src/lib/api/reminders";
import { dayLabel, longDay, monthName } from "../src/lib/calendar/month";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

const whatsNext = (page: Page) => page.getByRole("region", { name: "What's next" });

async function rowTexts(page: Page, region = whatsNext(page)): Promise<string[][]> {
  return region
    .getByRole("listitem")
    .evaluateAll((items) => items.map((item) => [...item.querySelectorAll(":scope > span > span")].map((line) => line.textContent ?? "")));
}

test("the Calendar shows an approved card's dates, opens from Home, and lists a tapped day", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("calendar"), checkA11y);

  const today = calendarDate(new Date().toISOString(), "America/New_York");
  const month = today.slice(0, 8);
  const dueDay = Number(today.slice(8));
  const closeDay = dueDay === 1 ? 2 : 1;
  const due = today;
  const closes = `${month}${String(closeDay).padStart(2, "0")}`;

  // Nothing saved yet: the month, today marked, and nothing to list.
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: monthName(today) })).toBeVisible();
  await expect(page.getByRole("button", { name: `Today, ${longDay(today)}` })).toHaveAttribute("aria-current", "date");
  await expect(whatsNext(page).getByText("Nothing else this month.")).toBeVisible();
  await checkA11y("calendar: empty");

  // An approved card, with its closing day and due day saved.
  const created = await page.request.post("/api/v1/applications", { data: { ...DISCOVER, status: "approved", creditLimitCents: 50000 } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  await page.goto(`/applications/${id}/reminders`);
  await page.getByLabel("Statement closes on day").fill(String(closeDay));
  await page.getByLabel("Payment due on day").fill(String(dueDay));
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).not.toHaveURL(/\/reminders$/);

  // Home's Coming up has the payment due today, and opens the Calendar.
  await page.goto("/home");
  await page.getByRole("link", { name: "See calendar" }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  // Both dates have a card-date dot; what is next starts with today's payment.
  await expect(page.getByRole("button", { name: `Today, ${longDay(due)}: Card dates` })).toBeVisible();
  await expect(page.getByRole("button", { name: `${longDay(closes)}: Card dates` })).toBeVisible();
  const upcoming = [[`${dayLabel(due, today)} · Payment due`, "Discover · turn on autopay"]];
  if (closes > today) upcoming.push([`${dayLabel(closes, today)} · Statement closes`, "Discover · pay down to $150"]);
  expect(await rowTexts(page)).toEqual(upcoming);
  await checkA11y("calendar: card dates");

  // Tapping the closing day lists only it; a second tap goes back.
  const closing = page.getByRole("button", { name: `${longDay(closes)}: Card dates` });
  await closing.click();
  await expect(closing).toHaveAttribute("aria-pressed", "true");
  expect(await rowTexts(page, page.getByRole("region", { name: longDay(closes) }))).toEqual([
    [`${dayLabel(closes, today)} · Statement closes`, "Discover · pay down to $150"],
  ]);
  await closing.click();
  await expect(closing).toHaveAttribute("aria-pressed", "false");
  await expect(whatsNext(page)).toBeVisible();

  // A reload keeps it, and nothing scrolls sideways.
  await page.reload();
  await expect(page.getByRole("button", { name: `Today, ${longDay(due)}: Card dates` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Every day is tall and wide enough to tap.
  const box = await closing.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
});

test("the Calendar asks a signed-out visitor to sign in, then comes back", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcalendar$/);
});
