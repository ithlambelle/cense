// Created with Claude Code (2026-11-19). Home's Coming up and when the bank
// was last read (Figma D1, 709:1459), as a real signed-up student on the local
// stack: no card and no bank shows no Coming up at all; an approved card's
// saved days list its statement and payment dates; a linked bank with who
// covers answers adds the bills the student pays (never groceries), four rows
// at most, soonest first; every row opens where its date is set, Back returns Home, and a
// reload keeps it all. On main there was no Coming up and no Updated time.
//
// Dates are worked out on the student's calendar (New York: no time zone is
// saved for students yet), a few days ahead of today so the test never
// depends on the day it runs.
import type { Server } from "node:http";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { calendarDate } from "../src/lib/api/reminders";
import { monthDay } from "../src/lib/reminders/in-app";
import { addDays } from "../src/lib/reminders/schedule";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { installFakeLink, resetFakePlaid, startFakePlaid } from "./support/fake-plaid";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };

let plaid: Server;

test.beforeAll(async () => {
  plaid = await startFakePlaid();
});

test.afterAll(async () => {
  await new Promise((resolve) => plaid.close(resolve));
});

test.beforeEach(async ({ context }) => {
  resetFakePlaid();
  await blockExternalRequests(context);
  await installFakeLink(context);
});

const ahead = (days: number) => addDays(calendarDate(new Date().toISOString(), "America/New_York"), days);
const dayOf = (date: string) => String(Number(date.slice(8)));

const comingUp = (page: Page) => page.getByRole("list", { name: "Coming up" });
const rows = (page: Page) => comingUp(page).getByRole("link");
const safeToSpendCard = (page: Page) => page.getByRole("region", { name: "Safe to spend", exact: true });

// Each row's two lines, as a student reads them.
async function rowTexts(page: Page): Promise<string[][]> {
  return rows(page).evaluateAll((links) =>
    links.map((link) => [...link.querySelectorAll(":scope > span > span")].map((line) => line.textContent ?? "")),
  );
}

// Who covers what: rent mine, phone split, tuition family, groceries mine,
// car not applicable, each paid bill due on the day given.
async function answerWhoCovers(page: Page, due: { rent: string; phone: string; groceries: string }) {
  const steps: { title: string; pick: string; amount?: { label: string; value: string; due: string } }[] = [
    { title: "Who covers your rent?", pick: "Me", amount: { label: "Your rent each month", value: "650", due: due.rent } },
    { title: "Who covers your phone?", pick: "Split", amount: { label: "Your share each month", value: "40", due: due.phone } },
    { title: "Who covers your tuition?", pick: "Family" },
    { title: "Who covers your groceries?", pick: "Me", amount: { label: "Your groceries each month", value: "200", due: due.groceries } },
    { title: "Who covers your car?", pick: "Not applicable" },
  ];
  for (const step of steps) {
    await expect(page.getByRole("heading", { level: 1, name: step.title })).toBeVisible();
    await page.getByRole("group", { name: step.title }).getByRole("button", { name: step.pick, exact: true }).click();
    if (step.amount) {
      await page.getByLabel(step.amount.label).fill(step.amount.value);
      await page.getByLabel("Due on day").fill(step.amount.due);
    }
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Anything to keep aside each month?" })).toBeVisible();
  await page.getByLabel("Set aside each month").fill("50");
  await page.getByRole("button", { name: "See safe to spend" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

// No sideways scroll, and the row fits the screen and is tall enough to tap.
async function fits(page: Page, target: Locator, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
  await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await target.boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.height, `${what}: tap target height`).toBeGreaterThanOrEqual(44);
  expect(box!.x, `${what}: clipped left`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what}: clipped right`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("Coming up lists an approved card's dates and the bills the student pays, and each row opens where its date is set", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("coming-up"), checkA11y);

  // No card and no bank: nothing ahead, and no empty Coming up.
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coming up" })).toHaveCount(0);

  // An approved card with no days saved yet: still nothing to list.
  const created = await page.request.post("/api/v1/applications", { data: { ...DISCOVER, status: "approved", creditLimitCents: 50000 } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  await page.reload();
  await expect(page.getByRole("region", { name: DISCOVER.cardName }).getByText("$500")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coming up" })).toHaveCount(0);

  // The student saves the card's days from Home's reminder row.
  const closes = ahead(3);
  const due = ahead(12);
  await page.getByRole("region", { name: DISCOVER.cardName }).getByRole("link", { name: /^Choose your reminders/ }).click();
  await page.getByLabel("Statement closes on day").fill(dayOf(closes));
  await page.getByLabel("Payment due on day").fill(dayOf(due));
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // No bank: the card's dates alone, as in "Home, no bank" (709:1304).
  const heading = page.getByRole("heading", { level: 2, name: "Coming up" });
  await expect(heading).toBeVisible();
  // Sora at its one loaded weight, never a faked bold (fonts.spec.ts).
  expect(await heading.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("500");
  expect(await rowTexts(page)).toEqual([
    [`${monthDay(closes)}  Statement closes`, "Discover · pay down to $150"],
    [`${monthDay(due)}  Payment due`, "Turn on autopay"],
  ]);
  await checkA11y("home: coming up, no bank");

  // The statement opens the card's reminder screen, where its days are set.
  await rows(page).nth(0).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/reminders$`));
  await expect(page.getByLabel("Statement closes on day")).toHaveValue(dayOf(closes));
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The payment, with autopay not on, opens the issuer's autopay steps
  // directly ("Turn on autopay"), not the Card setup list; the browser's Back
  // returns Home.
  await rows(page).nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay$`));
  await expect(page.getByRole("heading", { level: 1, name: /^Turn on autopay/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);

  // Link the stand-in bank and say who covers what.
  const rent = ahead(5);
  const phone = ahead(8);
  // Groceries are due before the card's payment, so they would push it out
  // of the four rows if they were listed. They sit outside safe to spend and
  // are never a Coming up row.
  const groceries = ahead(6);
  await page.goto("/safe-to-spend/connect");
  // "Connect (Preview)" on main, "Link your bank" once the Link your bank
  // screen (#127, Flow 5 C1) lands: either name, so this passes in both orders.
  await page.getByRole("button", { name: /^(Connect \(Preview\)|Link your bank)$/ }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  await answerWhoCovers(page, { rent: dayOf(rent), phone: dayOf(phone), groceries: dayOf(groceries) });

  // The hero says when the bank was read (709:1479), and still opens Your money.
  const hero = safeToSpendCard(page);
  await expect(hero).toContainText("Safe to spend today:");
  await expect(hero).toContainText("For the next 30 days");
  await expect(hero).toContainText(/Updated \d{1,2}:\d{2}\s[AP]M/);

  // Four rows at most, soonest first, and no groceries.
  const expected = [
    [`${monthDay(closes)}  Statement closes`, "Discover · pay down to $150"],
    [`${monthDay(rent)}  Rent, $650`, "You cover it · you typed this"],
    [`${monthDay(phone)}  Phone, $40`, "Your share · you typed this"],
    [`${monthDay(due)}  Payment due`, "Turn on autopay"],
  ];
  await expect(rows(page)).toHaveCount(4);
  expect(await rowTexts(page)).toEqual(expected);
  await expect(comingUp(page)).not.toContainText("Groceries");
  await checkA11y("home: coming up and safe to spend");
  // Every row names a card, a bill or an amount, so all are masked in session replay.
  const masked = (i: number) => rows(page).nth(i).evaluate((el) => el.closest(".ph-sensitive") !== null);
  expect([await masked(0), await masked(1), await masked(2), await masked(3)]).toEqual([true, true, true, true]);

  // A reload shows the same.
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  expect(await rowTexts(page)).toEqual(expected);
  await expect(safeToSpendCard(page)).toContainText(/Updated \d{1,2}:\d{2}\s[AP]M/);

  // A bill opens Your money, where it was typed; its back arrow returns Home.
  await rows(page).nth(1).click();
  await expect(page).toHaveURL(/\/safe-to-spend$/);
  await expect(page.getByLabel("Rent each month")).toHaveValue("650");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The card still opens Your money from its chevron.
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your money" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);

  // Every row fits at 320, 390 and 430 wide.
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(rows(page)).toHaveCount(4);
    for (let i = 0; i < 4; i++) await fits(page, rows(page).nth(i), `${width}: row ${i + 1}`);
    await fits(page, safeToSpendCard(page), `${width}: safe to spend`);
  }

  // Another student sees none of it.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockExternalRequests(other);
  const otherPage = await other.newPage();
  await signUp(otherPage, uniqueEmail("coming-up-other"), axeChecker(otherPage));
  await otherPage.goto("/home");
  await expect(otherPage.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(otherPage.getByRole("heading", { name: "Coming up" })).toHaveCount(0);
  await other.close();
});
