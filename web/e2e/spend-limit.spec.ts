// Created with Claude Code (2026-11-08). The spend limit (US-04, Figma Flow A
// 477:1005), as a real signed-in student on the local stack: Home's and the
// setup list's "Set a spend limit", "What is your credit limit?" (S1), "A limit
// to try this month" (S2), "Pick your limit" (S3), every Back, reloads, and the
// saves read back from the API.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function approvedStudent(page: Page, journey: string, creditLimitCents: number | null) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "approved", creditLimitCents },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  return { id, checkA11y };
}

async function saved(page: Page, id: string) {
  const response = await page.request.get(`/api/v1/applications/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { creditLimitCents: number | null; spendLimitCents: number | null };
}

async function noSidewaysScroll(page: Page, screen: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${screen}: horizontal scroll`).toBeLessThanOrEqual(0);
}

test("from Home: the suggestion, Pick my own and back, then Use $150 lights the star", async ({ page }) => {
  const { id, checkA11y } = await approvedStudent(page, "spend-home", 50000);
  const suggestionUrl = new RegExp(`/applications/${id}/setup/spend-limit/suggestion\\?from=home$`);

  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  await expect(card.getByRole("checkbox")).toHaveCount(0);
  // A credit limit is saved, so the star opens the suggestion (S2) directly.
  await card.getByRole("link", { name: /^Set a spend limit/ }).click();
  await expect(page).toHaveURL(suggestionUrl);
  await expect(page.getByRole("heading", { level: 1, name: "A limit to try this month" })).toBeVisible();
  const hero = page.getByRole("region", { name: "Suggested spend limit" });
  await expect(hero.getByText("$150", { exact: true })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: /^Your limit$/ })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "$500" })).toBeVisible();
  await expect(page.getByText("Educational, not financial advice")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await checkA11y("spend limit: suggestion");
  await noSidewaysScroll(page, "spend limit: suggestion");

  // The back arrow returns Home, the screen before (G1); Forward returns here.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goForward();
  await expect(page).toHaveURL(suggestionUrl);

  // Pick my own (S3), and its arrow back to the suggestion.
  await page.getByRole("link", { name: "Pick my own" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit/pick\\?from=home$`));
  await expect(page.getByRole("heading", { level: 1, name: "Pick your limit" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /\$150 a month, 30% of your limit/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /\$100 a month, tighter/ })).toHaveAttribute("aria-checked", "false");
  await checkA11y("spend limit: pick");
  await page.getByRole("link", { name: "Back to Your suggestion" }).click();
  await expect(page).toHaveURL(suggestionUrl);

  // Use $150: saved, and Home shows the star lit.
  const write = page.waitForResponse((r) => r.url().includes("/steps/spend_limit") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Use $150" }).click();
  expect((await write).ok()).toBe(true);
  await expect(page).toHaveURL(/\/home$/);
  await expect(card.getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();
  await expect(card.getByText("1 of 3 lit")).toBeVisible();
  await page.reload();
  await expect(card.getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();
  expect((await saved(page, id)).spendLimitCents).toBe(15000);

  // The setup list shows the same star done.
  await page.goto(`/applications/${id}/setup`);
  await expect(page.getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();

  // A credit limit edited below it on Home clears the spend limit it no longer fits.
  await page.goto("/home");
  await card.getByRole("button", { name: "Edit credit limit" }).click();
  await card.getByRole("textbox", { name: "Credit limit", exact: true }).fill("100");
  const edit = page.waitForResponse((r) => r.url().endsWith(`/api/v1/applications/${id}`) && r.request().method() === "PATCH");
  await card.getByRole("button", { name: "Save" }).click();
  expect((await edit).ok()).toBe(true);
  expect(await saved(page, id)).toMatchObject({ creditLimitCents: 10000, spendLimitCents: null });
  // Its star goes out with it, here and on the setup list, after a reload too.
  await expect(card.getByText("0 of 3 lit")).toBeVisible();
  await page.reload();
  await expect(card.getByRole("link", { name: /^Set a spend limit/ })).not.toContainText("done");
  await page.goto(`/applications/${id}/setup`);
  await expect(page.getByRole("link", { name: /^Set a spend limit/ })).not.toContainText("done");
});

test("from the setup list with no credit limit: S1 asks for it, then S3 saves another amount", async ({ page }) => {
  const { id, checkA11y } = await approvedStudent(page, "spend-setup", null);
  const setupUrl = new RegExp(`/applications/${id}/setup$`);
  const creditUrl = new RegExp(`/applications/${id}/setup/spend-limit$`);

  await page.goto(`/applications/${id}/setup`);
  await page.getByRole("link", { name: /^Set a spend limit/ }).click();
  await expect(page).toHaveURL(creditUrl);
  await expect(page.getByRole("heading", { level: 1, name: "What is your credit limit?" })).toBeVisible();
  const field = page.getByRole("textbox", { name: "Credit limit", exact: true });
  await expect(field).toHaveValue("");
  await checkA11y("spend limit: credit limit");
  await noSidewaysScroll(page, "spend limit: credit limit");

  // Back returns to the list, the screen before (G1); Forward returns here.
  await page.getByRole("link", { name: "Back to Card setup" }).click();
  await expect(page).toHaveURL(setupUrl);
  await page.goForward();
  await expect(page).toHaveURL(creditUrl);

  // Empty and bad amounts are refused in place, with nothing saved.
  await page.getByRole("button", { name: "See my suggestion" }).click();
  await expect(page.getByText("Enter your credit limit in dollars, like 500.")).toBeVisible();
  await page.getByRole("textbox", { name: "Credit limit", exact: true }).fill("12,34");
  await page.getByRole("button", { name: "See my suggestion" }).click();
  await expect(page.getByText("Enter your credit limit in dollars, like 500.")).toBeVisible();
  expect((await saved(page, id)).creditLimitCents).toBeNull();

  // $800 is saved, then the suggestion is 30% of it.
  await page.getByRole("textbox", { name: "Credit limit", exact: true }).fill("$800");
  await page.getByRole("button", { name: "See my suggestion" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit/suggestion$`));
  await expect(page.getByRole("button", { name: "Use $240" })).toBeVisible();
  expect((await saved(page, id)).creditLimitCents).toBe(80000);
  // S1 replaced itself, so the browser's Back never reopens the saved form.
  await page.goBack();
  await expect(page).toHaveURL(setupUrl);
  await page.goForward();

  await page.getByRole("link", { name: "Pick my own" }).click();
  await expect(page.getByRole("radio", { name: /\$160 a month, tighter/ })).toBeVisible();
  await expect(page.getByText("Above $240")).toBeVisible();
  const other = page.getByLabel("Another amount");
  await other.fill("900");
  await page.getByRole("button", { name: "Save my limit" }).click();
  await expect(page.getByText("Enter an amount from $1 to $800.")).toBeVisible();
  await other.fill("300");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  const write = page.waitForResponse((r) => r.url().includes("/steps/spend_limit") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Save my limit" }).click();
  expect((await write).ok()).toBe(true);

  // Back on the list, the star is lit, after a reload too.
  await expect(page).toHaveURL(setupUrl);
  await expect(page.getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();
  expect(await saved(page, id)).toMatchObject({ creditLimitCents: 80000, spendLimitCents: 30000 });
  // Back after the save never reopens Pick your limit.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/pick$/);
  await page.goto(`/applications/${id}/setup`);

  // Done, the row still opens the suggestion (the limit is known now), and
  // Pick your limit shows the amount saved.
  await page.getByRole("link", { name: /^Set a spend limit/ }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit/suggestion$`));
  await page.getByRole("link", { name: "Pick my own" }).click();
  await expect(page.getByLabel("Another amount")).toHaveValue("300");

  // Home shows it lit too.
  await page.goto("/home");
  await expect(page.getByRole("region", { name: DISCOVER.name }).getByRole("link", { name: /^Set a spend limit\s*, done/ })).toBeVisible();
});

test("the spend limit screens are only for the student's own approved card", async ({ page, browser }) => {
  const { id } = await approvedStudent(page, "spend-owner", null);
  // No credit limit: the suggestion and Pick your limit ask for it first.
  for (const path of ["suggestion", "pick"]) {
    await page.goto(`/applications/${id}/setup/spend-limit/${path}?from=home`);
    await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit\\?from=home$`));
  }

  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await blockExternalRequests(other);
  const otherPage = await other.newPage();
  await signUp(otherPage, uniqueEmail("spend-other"), async () => {});
  for (const path of ["setup/spend-limit", "setup/spend-limit/suggestion", "setup/spend-limit/pick"]) {
    const response = await otherPage.goto(`/applications/${id}/${path}`);
    expect(response?.status(), path).toBe(404);
  }
  // Nor through the API.
  const write = await otherPage.request.patch(`/api/v1/applications/${id}`, { data: { spendLimitCents: 10000 } });
  expect(write.status()).toBe(404);
  await other.close();

  // Signed out, the screen sends the visitor to sign in and back.
  const visitor = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await visitor.goto(`/applications/${id}/setup/spend-limit`);
  await expect(visitor).toHaveURL(/\/sign-in\?next=/);
  await visitor.context().close();

  // A spend limit above the credit limit is refused by the API.
  await page.request.patch(`/api/v1/applications/${id}`, { data: { creditLimitCents: 50000 } });
  const over = await page.request.patch(`/api/v1/applications/${id}`, { data: { spendLimitCents: 50001 } });
  expect(over.status()).toBe(400);
});
