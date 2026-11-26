// Created with Claude Code (2026-11-26). Pick a goal and Your plan (US-17,
// Demo Day steps 4 and 5), as real signed-up students on the local stack with
// the stand-in Plaid bank (support/fake-plaid.ts): link, Looks right, pick a
// goal, get a plan, accept it, and safe to spend on Home changes. Fails on the
// branch before this one, where Looks right went straight Home.
import type { Server } from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { formatIsoDate } from "../src/lib/dates";
import { addMonthsIso, easternToday, planAtSave } from "../src/lib/goals/plan";
import { moneyAmount } from "../src/lib/money";
import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { asStudent } from "./support/data-api";
import { installFakeLink, resetFakePlaid, startFakePlaid } from "./support/fake-plaid";

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

type SafeToSpend = { setAsideCents: number; leftCents: number; dailyCents: number; bills: unknown[] };
const safeToSpend = async (page: Page) => (await (await page.request.get("/api/v1/safe-to-spend")).json()) as SafeToSpend;
const safeToSpendCard = (page: Page) => page.getByRole("region", { name: "Safe to spend", exact: true });
const goals = (page: Page) => page.getByRole("group", { name: "Pick a goal" });
const pickGoalHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Pick a goal" });
const planHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Your plan" });
// The student's goal rows, read as them through the Data API (none or one).
type GoalRow = { preset: string; amount_cents: number; target_date: string; monthly_cents: number };
const savedGoals = async (page: Page) => (await asStudent(page.context(), { table: "goals" })).body as GoalRow[];

// A new student who linked the stand-in bank and tapped Looks right.
async function throughLooksRight(page: Page, journey: string, checkA11y: (screen: string) => Promise<void>) {
  await signUp(page, uniqueEmail(journey), checkA11y);
  await page.goto("/safe-to-spend/connect");
  await page.getByRole("button", { name: "Link your bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Here’s what we found" })).toBeVisible();
  const before = await safeToSpend(page);
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(/\/start\/goal$/);
  await expect(pickGoalHeading(page)).toBeVisible();
  return before;
}

test("a student picks Emergency fund with the suggestion, accepts the plan, and safe to spend on Home changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const checkA11y = axeChecker(page);
  const before = await throughLooksRight(page, "goal-accept", checkA11y);
  expect(before.setAsideCents).toBe(0);

  // Three goals first, the rest behind More goals; no Start investing.
  await expect(goals(page).getByRole("button")).toHaveText(["Emergency fund", "Pay off my card", "Trip"]);
  await page.getByRole("button", { name: "More goals" }).click();
  await expect(goals(page).getByRole("button")).toHaveText(["Emergency fund", "Pay off my card", "Trip", "Buy a car", "Buy a home", "Something else"]);
  await expect(page.getByText(/invest/i)).toHaveCount(0);
  // What a student saves for is masked in session replay.
  await expect(goals(page)).toHaveClass(/\bph-sensitive\b/);

  // The stand-in bank's rent and groceries are $925 a month, under $1,000,
  // so the emergency fund suggests $1,000; its card owes $310.
  await goals(page).getByRole("button", { name: "Pay off my card" }).click();
  await expect(page.getByLabel("How much?")).toHaveValue("310");
  await expect(page.getByText("Suggested $310: what your card owes today, from your bank.")).toBeVisible();
  await goals(page).getByRole("button", { name: "Emergency fund" }).click();
  await expect(goals(page).getByRole("button", { name: "Emergency fund" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("How much?")).toHaveValue("1000");
  await expect(page.getByText("Suggested $1,000: a starter cushion.")).toBeVisible();
  await checkA11y("pick a goal");

  // A reload before saving starts the screen again, nothing saved.
  await page.reload();
  await expect(pickGoalHeading(page)).toBeVisible();
  await expect(goals(page).getByRole("button", { pressed: true })).toHaveCount(0);
  expect(await savedGoals(page)).toEqual([]);

  // Pick it again with the suggestion and no date: 6 months.
  await goals(page).getByRole("button", { name: "Emergency fund" }).click();
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page).toHaveURL(/\/start\/plan$/);
  await expect(planHeading(page)).toBeVisible();
  const plan = planAtSave({ amountCents: 100_000, targetDate: null }, easternToday());
  expect(plan).toEqual({ targetDate: addMonthsIso(easternToday(), 6), monthlyCents: 16_667 });
  await expect(page.getByText(`Emergency fund: $1,000 by ${formatIsoDate(plan.targetDate)}`)).toBeVisible();
  const month = page.getByRole("region", { name: "Each month" });
  // Money in is last month's $1,800; bills $925; $1,800 - $925 - $166.67.
  await expect(month.getByRole("listitem")).toHaveText(["Money in$1,800", "Bills$925", "Set aside for your goal$166.67", "Left for everything else$708.33"]);
  await checkA11y("your plan");

  // A reload shows the same plan, from what was saved.
  await page.reload();
  await expect(month.getByRole("listitem")).toHaveText(["Money in$1,800", "Bills$925", "Set aside for your goal$166.67", "Left for everything else$708.33"]);

  // Back returns to Pick a goal with the goal filled in; Edit does too.
  await page.getByRole("link", { name: "Back to Pick a goal" }).click();
  await expect(pickGoalHeading(page)).toBeVisible();
  await expect(goals(page).getByRole("button", { name: "Emergency fund" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("How much?")).toHaveValue("1000");
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(planHeading(page)).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(pickGoalHeading(page)).toBeVisible();
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(planHeading(page)).toBeVisible();
  // Nothing changes safe to spend until the plan is accepted.
  expect((await safeToSpend(page)).setAsideCents).toBe(0);

  // Accept: the set-aside is the plan's, the bills are unchanged, and Home's
  // number is the new one.
  await page.getByRole("button", { name: "Accept plan" }).click();
  await expect(page).toHaveURL(/\/home$/);
  const after = await safeToSpend(page);
  expect(after.setAsideCents).toBe(16_667);
  expect(after.bills).toEqual(before.bills);
  expect(after.leftCents).toBe(before.leftCents - 16_667);
  expect(after.dailyCents).toBeLessThan(before.dailyCents);
  await expect(safeToSpendCard(page)).toContainText(moneyAmount(after.dailyCents));
  await expect(safeToSpendCard(page)).not.toContainText(moneyAmount(before.dailyCents));

  // This month shows it as saving.
  await page.goto("/safe-to-spend?tab=month");
  await expect(page.getByLabel("Savings goal")).toHaveValue("166.67");

  // The goal is saved, and Back from Home never reopens the plan.
  // Saved with its date and monthly amount fixed, so the plan never drifts.
  expect(await savedGoals(page)).toMatchObject([{ preset: "emergency_fund", amount_cents: 100_000, target_date: plan.targetDate, monthly_cents: 16_667 }]);
  await page.goto("/home");
  await page.goBack();
  await expect(page).not.toHaveURL(/\/start\/plan$/);
});

test("Not now goes Home with no goal and nothing set aside, and the screens need a signed-in student", async ({ page, context }) => {
  const checkA11y = axeChecker(page);
  const before = await throughLooksRight(page, "goal-not-now", checkA11y);
  await page.getByRole("link", { name: "Not now" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(safeToSpendCard(page)).toContainText(moneyAmount(before.dailyCents));
  expect(await savedGoals(page)).toEqual([]);
  expect((await safeToSpend(page)).setAsideCents).toBe(0);

  // Your plan with no goal opens Pick a goal.
  await page.goto("/start/plan");
  await expect(page).toHaveURL(/\/start\/goal$/);

  await context.clearCookies();
  await page.goto("/start/goal");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fstart%2Fgoal$/);
  await page.goto("/start/plan");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fstart%2Fplan$/);
  expect((await page.request.put("/api/v1/me/goal", { data: { preset: "trip", name: "Trip", amountCents: 100 } })).status()).toBe(401);
});

test("a typed goal with a date, then changed and removed, at 320 wide with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const checkA11y = axeChecker(page);
  await throughLooksRight(page, "goal-typed", checkA11y);
  const fits = async (what: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
  };
  await fits("pick a goal");

  await page.getByRole("button", { name: "More goals" }).click();
  await goals(page).getByRole("button", { name: "Something else" }).click();
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByText("Say what it’s for.")).toBeVisible();
  await page.getByLabel("What is it for?").fill("Laptop");
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByText("Enter an amount, like 500.")).toBeVisible();
  await page.getByLabel("How much?").fill("1,200");
  await page.getByLabel("By when?").fill(easternToday());
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByText("Pick a date after today.")).toBeVisible();
  // Four months out.
  const by = addMonthsIso(easternToday(), 4);
  await page.getByLabel("By when?").fill(by);
  await fits("pick a goal, filled in");
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(planHeading(page)).toBeVisible();
  const plan = planAtSave({ amountCents: 120_000, targetDate: by }, easternToday());
  await expect(page.getByText(`Laptop: $1,200 by ${formatIsoDate(by)}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Each month" }).getByRole("listitem").nth(2)).toHaveText(`Set aside for your goal${moneyAmount(plan.monthlyCents)}`);
  await fits("your plan");
  await checkA11y("your plan at 320");

  // Change it to a trip, then remove it: Home, no goal, and the set-aside left alone.
  await page.getByRole("link", { name: "Edit" }).click();
  await goals(page).getByRole("button", { name: "Trip" }).click();
  await expect(page.getByLabel("How much?")).toHaveValue("");
  await page.getByLabel("How much?").fill("600");
  await page.getByRole("button", { name: "See my plan" }).click();
  await expect(page.getByText(/^Trip: \$600 by /)).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove my goal" }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(await savedGoals(page)).toEqual([]);
});
