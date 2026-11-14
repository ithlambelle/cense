// Safe to spend on a Plaid sandbox bank (Flow C, Figma 222:2041, 222:2090,
// 222:2133), as real signed-up students on the local stack. Plaid is the
// stand-in in support/fake-plaid.ts: the app is started with PLAID_BASE_URL
// pointing at it, and Link's script is answered in the browser. Every journey
// here failed on main, where none of these screens or routes existed.
import type { Server } from "node:http";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { asStudent } from "./support/data-api";
import {
  behavior,
  installFakeLink,
  issuedAccessTokens,
  received,
  removedAccessTokens,
  resetFakePlaid,
  startFakePlaid,
  type LinkOutcome,
} from "./support/fake-plaid";

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

async function setLinkOutcome(page: Page, outcome: LinkOutcome) {
  await page.evaluate((value) => {
    (window as unknown as { __fakePlaidOutcome: string }).__fakePlaidOutcome = value;
  }, outcome);
}

// The answers every journey gives: rent $650 (me), phone $40 (my share of a
// split), tuition (family), groceries and car (not applicable), $50 aside.
// With the stand-in bank ($1,240 checking, $310 on the card):
// 1,240 - 310 - 690 - 50 = 190 left, over 30 days = $6.33 a day.
const DAILY = "$6.33";

async function answerWhoCovers(page: Page, checkA11y?: (screen: string) => Promise<void>) {
  const steps: { bill: string; title: string; pick: string; amount?: { label: string; value: string } }[] = [
    { bill: "Rent", title: "Who covers your rent?", pick: "Me", amount: { label: "Your rent each month", value: "650" } },
    { bill: "Phone", title: "Who covers your phone?", pick: "Split", amount: { label: "Your share each month", value: "40" } },
    { bill: "Tuition", title: "Who covers your tuition?", pick: "Family" },
    { bill: "Groceries", title: "Who covers your groceries?", pick: "Not applicable" },
    { bill: "Car", title: "Who covers your car?", pick: "Not applicable" },
  ];
  for (const [index, step] of steps.entries()) {
    await expect(page.getByRole("heading", { level: 1, name: step.title })).toBeVisible();
    await expect(page.getByText(`${step.bill} · ${index + 1} of 5`)).toBeVisible();
    if (index === 0 && checkA11y) {
      // Continue with nothing picked asks for a pick and stays.
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Pick who covers your rent.");
      await checkA11y("safe to spend: who covers");
    }
    await page.getByRole("group", { name: step.title }).getByRole("button", { name: step.pick, exact: true }).click();
    if (step.amount) {
      const field = page.getByLabel(step.amount.label);
      if (index === 0) {
        // An amount is needed for "Me": empty is refused.
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter an amount");
      }
      await field.fill(step.amount.value);
      // Due on the 31st, so the bill is always still to come this month and
      // the number does not depend on the day the test runs.
      if (index === 0) {
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter a day from 1 to 31.");
      }
      await page.getByLabel("Due on day").fill("31");
    }
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Anything to keep aside each month?" })).toBeVisible();
  if (checkA11y) await checkA11y("safe to spend: set aside");
  await page.getByLabel("Set aside each month").fill("50");
  await page.getByRole("button", { name: "See safe to spend" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

// A new student who has linked the stand-in bank and answered, on Home.
async function linkedStudent(page: Page, journey: string) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  await page.goto("/safe-to-spend/connect");
  await page.getByRole("button", { name: "Connect (Preview)" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  await answerWhoCovers(page);
  await expect(safeToSpendCard(page)).toContainText(DAILY);
  return checkA11y;
}

// A day in the last full calendar month, where the stand-in bank's
// transactions are, as YYYY-MM-DD.
function lastMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
}

// Exact: the invite's region is "See what’s safe to spend".
const safeToSpendCard = (page: Page) => page.getByRole("region", { name: "Safe to spend", exact: true });

async function apiStatus(page: Page) {
  return (await page.request.get("/api/v1/safe-to-spend")).status();
}

// Every body the browser received from the app, to look for secrets in.
function recordBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Redirects and aborted requests have no body.
    }
  });
  return bodies;
}

test("a student links the sandbox bank, says who covers what, and sees safe to spend on Home after a reload", async ({ page }) => {
  const bodies = recordBodies(page);
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("sts-link"), checkA11y);

  // Home invites; nothing is linked yet.
  await page.goto("/home");
  const invite = page.getByRole("region", { name: "See what’s safe to spend" });
  await expect(invite).toContainText("Preview");
  await checkA11y("home: safe to spend invite");
  expect(await apiStatus(page)).toBe(404);
  await invite.getByRole("link", { name: "Try it" }).click();

  // Consent (222:2041), then the stand-in Link connects.
  await expect(page).toHaveURL(/\/safe-to-spend\/connect$/);
  await expect(page.getByRole("heading", { level: 1, name: "See what’s safe to spend" })).toBeVisible();
  await expect(page.getByText("Sandbox only, no live data")).toBeVisible();
  await expect(page.getByText("We never see your password")).toBeVisible();
  await checkA11y("safe to spend: connect");
  await page.getByRole("button", { name: "Connect (Preview)" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);

  // Who covers what (222:2090), then the set-aside, then Home.
  await answerWhoCovers(page, checkA11y);
  const card = safeToSpendCard(page);
  await expect(card).toContainText("Safe to spend today");
  await expect(card).toContainText(DAILY);
  await expect(card).toContainText("Preview");
  await checkA11y("home: safe to spend");
  // Back goes where the student came from (Home), never into the finished
  // questions or the consent screen.
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(safeToSpendCard(page)).toContainText(DAILY);

  // Your money (D2): tapping the card opens Today, each step of the sum.
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your money" })).toBeVisible();
  const bank = page.getByRole("list", { name: "From your bank" });
  await expect(bank.getByRole("listitem").filter({ hasText: "Cash in checking" })).toContainText("$1,240");
  await expect(bank.getByRole("listitem").filter({ hasText: "Card balances" })).toContainText("$310");
  await expect(page.getByLabel("Rent each month")).toHaveValue("650");
  await expect(page.getByLabel("Phone each month")).toHaveValue("40");
  await expect(page.getByLabel("Savings goal")).toHaveValue("50");
  const fromYou = page.getByRole("list", { name: "From you" });
  await expect(fromYou.getByRole("listitem").filter({ hasText: "Left for 30 days" })).toContainText("$190");
  await expect(fromYou.getByRole("listitem").filter({ hasText: "Left for 30 days" })).toContainText(`${DAILY} a day`);
  // Disconnect is not on this page any more (E4).
  await expect(page.getByRole("button", { name: "Disconnect bank" })).toHaveCount(0);
  await checkA11y("your money: today");

  // Accounts (E4) from Profile: the bank's kinds of account, never its loans.
  await page.goto("/settings");
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  const yourBank = page.getByRole("list", { name: "Your bank" });
  await expect(yourBank).toContainText("Checking, savings and credit card");
  await expect(yourBank).not.toContainText("Student Loan");
  await checkA11y("accounts");

  // Change an answer: tuition becomes mine at $100, so 90 left, $3 a day.
  // The saved answers are already picked, so Continue moves straight on.
  await page.getByRole("link", { name: /Change your answers/ }).click();
  const continueTo = async (title: string) => {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  };
  await expect(page.getByRole("heading", { level: 1, name: "Who covers your rent?" })).toBeVisible();
  await expect(page.getByLabel("Your rent each month")).toHaveValue("650");
  await continueTo("Who covers your phone?");
  // The back arrow steps back through the questions.
  await page.getByRole("link", { name: "Back to the last question" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Who covers your rent?" })).toBeVisible();
  await continueTo("Who covers your phone?");
  await continueTo("Who covers your tuition?");
  await page.getByRole("group", { name: "Who covers your tuition?" }).getByRole("button", { name: "Me", exact: true }).click();
  // Tuition is asked per semester: $400 a semester is $100 a month.
  await expect(page.getByLabel("Due on day")).toHaveCount(0);
  await page.getByLabel("Your tuition each semester").fill("400");
  await continueTo("Who covers your groceries?");
  await continueTo("Who covers your car?");
  await continueTo("Anything to keep aside each month?");
  await expect(page.getByLabel("Set aside each month")).toHaveValue("50");
  await page.getByRole("button", { name: "See safe to spend" }).click();
  await expect(safeToSpendCard(page)).toContainText("$3 a day");
  // Back returns to Accounts, where the change started.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await page.goto("/home");

  // Back from Your money returns Home.
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your money" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The access token stayed on the server: no page or API answer carried it,
  // and every Plaid call carried the client id and secret as headers.
  expect(issuedAccessTokens.length).toBeGreaterThan(0);
  const token = issuedAccessTokens.at(-1)!;
  expect(bodies.some((body) => body.includes(token))).toBe(false);
  expect(received.every((call) => call.clientId && call.secret)).toBe(true);
  expect(received.some((call) => JSON.stringify(call.body).includes(String(call.secret)))).toBe(false);
});

test("Your money: a student edits a bill on Today, reads This month from their own transactions, edits a line, reloads, and sees Short", async ({ page, context }) => {
  const checkA11y = await linkedStudent(page, "sts-your-money");
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await expect(page.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");

  // Today: rent 650 to 700 updates the sum as typed, and saves on Enter.
  // 1,240 - 310 - 700 - 40 - 50 = 140 left, $4.66 a day.
  const total = page.getByRole("list", { name: "From you" }).getByRole("listitem").filter({ hasText: "Left for 30 days" });
  await page.getByLabel("Rent each month").fill("700");
  await expect(total).toContainText("$140");
  await page.getByLabel("Rent each month").press("Enter");
  await expect(page.getByRole("region", { name: "Safe to spend today" })).toContainText("$4.66");
  // Not an amount: flagged, nothing saved.
  await page.getByLabel("Savings goal").fill("lots");
  await page.getByLabel("Savings goal").press("Enter");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Use an amount like 25 or 25.50.");
  await page.reload();
  await expect(page.getByLabel("Rent each month")).toHaveValue("700");
  await expect(page.getByLabel("Savings goal")).toHaveValue("50");
  // The bills say when they are due, never "You cover it" (Ben, Nov 14).
  const fromYouToday = page.getByRole("list", { name: "From you", exact: true });
  await expect(fromYouToday.getByRole("listitem").filter({ hasText: "Phone" })).toContainText("Your share · due the");
  await expect(fromYouToday).not.toContainText("You cover it");
  await expect(fromYouToday).not.toContainText("Each month");
  // The same answers as Change your answers: the questions show the new rent.
  await page.goto("/safe-to-spend/setup");
  await expect(page.getByLabel("Your rent each month")).toHaveValue("700");
  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText("$4.66 a day");

  // This month, from the stand-in bank's last full month: income $1,800;
  // needs 650 + 275 + 24; wants 70 + 12 + 50 (after a refund); $50 aside.
  // A card payment and a move to savings are not spending. 669 left over.
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await page.getByRole("link", { name: "This month" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\?tab=month$/);
  const hero = page.getByRole("region", { name: /each month/ });
  await expect(hero).toContainText("Left over each month:");
  await expect(hero).toContainText("$669");
  await expect(page.getByLabel("Income each month")).toHaveValue("1,800");
  await expect(page.getByLabel("Rent and bills each month")).toHaveValue("650");
  await expect(page.getByLabel("Groceries each month")).toHaveValue("275");
  await expect(page.getByLabel("Eating out each month")).toHaveValue("70");
  await expect(page.getByLabel("Shopping and personal care each month")).toHaveValue("50");
  await expect(page.getByLabel("Savings goal")).toHaveValue("50");
  await expect(page.getByText("Educational, not financial advice.")).toHaveCount(0);
  // No undo on a line that is the bank's number.
  await expect(page.getByRole("button", { name: /^Use the bank's number/ })).toHaveCount(0);
  await checkA11y("your money: this month");

  // Edit a line: the total moves as typed, the number is the student's after a reload.
  await page.getByLabel("Groceries each month").fill("300");
  await expect(hero).toContainText("$644");
  await page.getByLabel("Groceries each month").press("Enter");
  await expect(page.getByLabel("Groceries each month").locator("xpath=ancestor::li[1]")).toContainText("You typed");
  await page.reload();
  await expect(page.getByLabel("Groceries each month")).toHaveValue("300");
  await expect(hero).toContainText("$644");

  // Undo: the typed number goes, and the bank's $275 is back after a reload.
  const groceries = page.getByLabel("Groceries each month").locator("xpath=ancestor::li[1]");
  await expect(groceries).toContainText("You typed");
  await page.getByRole("button", { name: "Use the bank's number for Groceries" }).click();
  await expect(page.getByLabel("Groceries each month")).toHaveValue("275");
  await expect(hero).toContainText("$669");
  await expect(groceries).not.toContainText("You typed");
  await expect(page.getByRole("button", { name: "Use the bank's number for Groceries" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Groceries each month")).toHaveValue("275");
  await expect(groceries).not.toContainText("You typed");
  await expect(hero).toContainText("$669");
  expect((await asStudent(context, { table: "budget_amounts" })).body).toEqual([]);
  // Typed again for the Short steps below.
  await page.getByLabel("Groceries each month").fill("300");
  await page.getByLabel("Groceries each month").press("Enter");
  await expect(groceries).toContainText("You typed");

  // Short: eating out at $1,000 is 286 short, and fixed costs did not pass income.
  await page.getByLabel("Eating out each month").fill("1000");
  await expect(hero).toContainText("Short each month by:");
  await expect(hero).toContainText("$286");
  await expect(hero).toContainText("After needs, wants and saving");
  await page.getByLabel("Eating out each month").press("Enter");
  await expect(page.getByLabel("Eating out each month").locator("xpath=ancestor::li[1]")).toContainText("You typed");
  // Needs alone past income: the one plain line says so, no suggestion.
  await page.getByLabel("Rent and bills each month").fill("2000");
  await expect(hero).toContainText("Needs and fixed wants are more than income");
  await page.getByLabel("Rent and bills each month").press("Enter");
  await expect(page.getByLabel("Rent and bills each month").locator("xpath=ancestor::li[1]")).toContainText("You typed");
  await page.reload();
  await expect(hero).toContainText("Short each month by:");
  await expect(hero).toContainText("Needs and fixed wants are more than income");
  await checkA11y("your money: short");
  const saved = await asStudent(context, { table: "budget_amounts" });
  expect((saved.body as { line: string }[]).map((row) => row.line).sort()).toEqual(["eating_out", "groceries", "rent_and_bills"]);

  // Back leaves Your money for Home; the tabs never stack in history.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("This month waits for the bank's transactions, then shows them after Refresh now", async ({ page }) => {
  behavior.transactions = "none";
  await linkedStudent(page, "sts-month-waits");
  await page.goto("/safe-to-spend?tab=month");
  const hero = page.getByRole("region", { name: /each month/ });
  await expect(hero).toContainText("Not yet");
  await expect(hero).toContainText("No transactions from your bank yet");
  await expect(page.getByText("Educational, not financial advice.")).toHaveCount(0);

  behavior.transactions = "ok";
  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeEnabled();
  await page.goto("/safe-to-spend?tab=month");
  await expect(hero).toContainText("Left over each month:");
  await expect(page.getByLabel("Income each month")).toHaveValue("1,800");
});

test("Link cancelled, a bank error and an expired connection leave nothing linked, and a retry works", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("sts-edges"), checkA11y);
  await page.goto("/safe-to-spend/connect");
  const connect = page.getByRole("button", { name: "Connect (Preview)" });

  await setLinkOutcome(page, "cancel");
  await connect.click();
  await expect(page.getByText("No bank connected. Try again when you’re ready.")).toBeVisible();
  expect(await apiStatus(page)).toBe(404);

  await setLinkOutcome(page, "bank_error");
  await connect.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("The bank connection didn’t finish.");
  await checkA11y("safe to spend: connect error");
  expect(await apiStatus(page)).toBe(404);

  await setLinkOutcome(page, "expired");
  await connect.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("That connection expired.");
  expect(await apiStatus(page)).toBe(404);

  await setLinkOutcome(page, "success");
  await connect.click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  // Linked now; the questions are not answered yet, so Home asks for them.
  expect(await apiStatus(page)).toBe(200);
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Finish safe to spend" })).toBeVisible();

  // A second link is refused while one exists: the connect screen sends on to
  // the questions, and the API refuses before Plaid makes a second Item.
  const linked = issuedAccessTokens.at(-1)!;
  const issued = issuedAccessTokens.length;
  await page.goto("/safe-to-spend/connect");
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  const again = await page.request.post("/api/v1/bank-link", { data: { publicToken: "public-sandbox-good" } });
  expect(again.status()).toBe(409);
  expect((await page.request.post("/api/v1/bank-link/link-token")).status()).toBe(409);
  expect(issuedAccessTokens.length).toBe(issued);
  expect(removedAccessTokens).not.toContain(linked);
});

test("when the bank needs a new sign-in, the student reconnects and safe to spend comes back", async ({ page }) => {
  await linkedStudent(page, "sts-reconnect");
  behavior.accounts = "login_required";
  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByText("Your bank needs you to sign in again.")).toBeVisible();

  // Home says so too, instead of an old number.
  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText("Reconnect your bank");
  await expect(safeToSpendCard(page)).not.toContainText(DAILY);
  await safeToSpendCard(page).getByRole("link", { name: "Reconnect your bank" }).click();

  // Link opens in update mode (the same Item), then balances are read again.
  behavior.accounts = "ok";
  await page.getByRole("button", { name: "Reconnect your bank" }).click();
  await expect(page.getByText("Your bank needs you to sign in again.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  const opened = await page.evaluate(() => (window as unknown as { __fakePlaidOpened: { token: string }[] }).__fakePlaidOpened);
  expect(opened.at(-1)?.token).toContain("update");
  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText(DAILY);
});

test("when the bank link is gone at Plaid, Home stops showing the number and the student connects again", async ({ page }) => {
  await linkedStudent(page, "sts-relink");
  behavior.accounts = "gone";
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Your bank connection ended.")).toBeVisible();

  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText("Your bank connection ended.");
  await expect(safeToSpendCard(page)).not.toContainText(DAILY);
  await safeToSpendCard(page).getByRole("link", { name: "Connect again" }).click();
  await expect(page).toHaveURL(/\/settings\/accounts$/);

  // Connect again disconnects the dead link, then links the bank anew.
  await page.getByRole("button", { name: "Connect again" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/connect$/);
  behavior.accounts = "ok";
  await page.getByRole("button", { name: "Connect (Preview)" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  await answerWhoCovers(page);
  await expect(safeToSpendCard(page)).toContainText(DAILY);
});

// What has keyboard focus after Tabbing to the control named `name`, and the
// ring it draws.
async function tabTo(page: Page, name: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " "),
        keyboard: el.matches(":focus-visible"),
        style: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    if (focused?.name === name) return focused;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test("the safe-to-spend links show a focus ring from the keyboard", async ({ page }) => {
  await signUp(page, uniqueEmail("sts-focus"), axeChecker(page));
  await page.goto("/safe-to-spend/connect");
  const rings: Record<string, Awaited<ReturnType<typeof tabTo>>> = {};
  rings["Not now"] = await tabTo(page, "Not now");
  await page.getByRole("button", { name: "Connect (Preview)" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
  await answerWhoCovers(page);
  rings["Your money"] = await tabTo(page, "Your money");
  await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your money" })).toBeVisible();
  rings["This month"] = await tabTo(page, "This month");
  await page.goto("/settings/accounts");
  rings["Refresh now"] = await tabTo(page, "Refresh now");
  await page.getByRole("button", { name: "Disconnect bank" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  rings["my.plaid.com"] = await tabTo(page, "my.plaid.com");
  behavior.accounts = "login_required";
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByText("Your bank needs you to sign in again.")).toBeVisible();
  await page.goto("/home");
  rings["Reconnect your bank"] = await tabTo(page, "Reconnect your bank");
  for (const [name, ring] of Object.entries(rings)) {
    expect(ring.keyboard, `${name} matches :focus-visible`).toBe(true);
    expect(ring.style, `${name} ring style`).toBe("solid");
    expect(ring.width, `${name} ring width`).toBeGreaterThanOrEqual(2);
  }
});

test("disconnecting removes the bank at Plaid and deletes every balance and answer", async ({ page, context }) => {
  const checkA11y = await linkedStudent(page, "sts-unlink");
  const token = issuedAccessTokens.at(-1)!;
  // A number typed on This month, so the check below proves it goes too.
  expect((await page.request.put("/api/v1/budget/lines/groceries", { data: { amountCents: 25_000 } })).status()).toBe(200);
  expect((await asStudent(context, { table: "budget_amounts" })).body).toHaveLength(1);
  await page.goto("/settings/accounts");

  // Plaid down: nothing changes, and the student is told.
  behavior.remove = "down";
  await page.getByRole("button", { name: "Disconnect bank" }).click();
  const sheet = page.getByRole("dialog", { name: "Disconnect your bank?" });
  await expect(sheet).toContainText("my.plaid.com");
  await checkA11y("accounts: disconnect sheet");
  await sheet.getByRole("button", { name: "Disconnect" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Nothing changed");
  expect(await apiStatus(page)).toBe(200);
  expect(removedAccessTokens).not.toContain(token);

  behavior.remove = "ok";
  await sheet.getByRole("button", { name: "Disconnect" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("region", { name: "See what’s safe to spend" })).toBeVisible();
  await expect(safeToSpendCard(page)).toHaveCount(0);
  expect(removedAccessTokens).toContain(token);
  expect(await apiStatus(page)).toBe(404);
  for (const table of ["bank_links", "bank_balances", "bill_coverage", "budget_amounts"]) {
    const rows = await asStudent(context, { table });
    expect(rows, table).toEqual({ status: 200, body: [] });
  }
  expect(await asStudent(context, { rpc: "bank_link_secret" })).toEqual({ status: 200, body: [] });

  // A reload does not bring anything back, and the student can link again.
  await page.reload();
  await expect(page.getByRole("region", { name: "See what’s safe to spend" })).toBeVisible();
});

test("signed out: the screens send to sign-in and the API refuses", async ({ page }) => {
  for (const path of ["/safe-to-spend", "/safe-to-spend/connect", "/safe-to-spend/setup", "/settings/accounts"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  }
  expect((await page.request.get("/api/v1/safe-to-spend")).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link/link-token")).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link", { data: { publicToken: "public-sandbox-good" } })).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link/refresh")).status()).toBe(401);
  expect((await page.request.delete("/api/v1/bank-link")).status()).toBe(401);
  expect((await page.request.put("/api/v1/safe-to-spend/answers", { data: {} })).status()).toBe(401);
  expect((await page.request.get("/api/v1/budget")).status()).toBe(401);
  expect((await page.request.put("/api/v1/budget/lines/groceries", { data: { amountCents: 1 } })).status()).toBe(401);
  expect((await page.request.delete("/api/v1/budget/lines/groceries")).status()).toBe(401);
  expect(received).toEqual([]);
});

test("another student sees none of the first student's bank data, in the app or through the Data API", async ({ page, context, browser }) => {
  await linkedStudent(page, "sts-owner");
  const ownerToken = issuedAccessTokens.at(-1)!;
  expect((await page.request.put("/api/v1/budget/lines/income", { data: { amountCents: 300_000 } })).status()).toBe(200);

  const otherContext: BrowserContext = await browser.newContext();
  await blockExternalRequests(otherContext);
  await installFakeLink(otherContext);
  const other = await otherContext.newPage();
  await signUp(other, uniqueEmail("sts-other"), axeChecker(other));
  await other.goto("/home");
  await expect(other.getByRole("region", { name: "See what’s safe to spend" })).toBeVisible();
  await expect(other.getByText(DAILY)).toHaveCount(0);
  expect(await apiStatus(other)).toBe(404);
  // Refresh and disconnect act only on the caller's own link.
  expect((await other.request.post("/api/v1/bank-link/refresh")).status()).toBe(404);
  expect((await other.request.delete("/api/v1/bank-link")).status()).toBe(404);
  // No budget without a bank of their own, and none of the owner's numbers.
  expect((await other.request.get("/api/v1/budget")).status()).toBe(404);
  expect((await other.request.put("/api/v1/budget/lines/income", { data: { amountCents: 1 } })).status()).toBe(404);
  expect((await other.request.delete("/api/v1/budget/lines/income")).status()).toBe(404);
  expect(await asStudent(otherContext, { rpc: "spending_by_detailed_category", args: { p_month: lastMonth() } })).toEqual({ status: 200, body: [] });

  for (const table of ["bank_links", "bank_balances", "bill_coverage", "budget_amounts"]) {
    expect(await asStudent(otherContext, { table }), table).toEqual({ status: 200, body: [] });
  }
  expect(await asStudent(otherContext, { rpc: "bank_link_secret" })).toEqual({ status: 200, body: [] });
  // The token table is in a schema the Data API does not serve, even to its owner.
  for (const ctx of [context, otherContext]) {
    const items = await asStudent(ctx, { table: "items", schema: "plaid" });
    expect(items.status).toBeGreaterThanOrEqual(400);
  }
  // The owner reads their own secret only as ciphertext.
  const own = await asStudent(context, { rpc: "bank_link_secret" });
  expect(own.status).toBe(200);
  expect(JSON.stringify(own.body)).not.toContain(ownerToken);
  expect(JSON.stringify(own.body)).toMatch(/"token_ciphertext":"v1\./);

  // The owner's data is untouched.
  expect(await apiStatus(page)).toBe(200);
  expect((await asStudent(context, { table: "budget_amounts" })).body).toHaveLength(1);
  expect(removedAccessTokens).not.toContain(ownerToken);
  await otherContext.close();
});

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`at ${size.width}x${size.height} every safe-to-spend screen fits without sideways scroll`, async ({ page }) => {
    await page.setViewportSize(size);
    const checkA11y = axeChecker(page);
    await signUp(page, uniqueEmail(`sts-fit-${size.width}`), checkA11y);
    const fits = async (what: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
    };
    await page.goto("/home");
    await expect(page.getByRole("region", { name: "See what’s safe to spend" })).toBeVisible();
    await fits("home invite");
    await page.goto("/safe-to-spend/connect");
    await fits("connect");
    const connect = page.getByRole("button", { name: "Connect (Preview)" });
    await expect(connect).toBeInViewport();
    await connect.click();
    await expect(page).toHaveURL(/\/safe-to-spend\/setup/);
    await fits("who covers");
    await answerWhoCovers(page);
    await expect(safeToSpendCard(page)).toContainText(DAILY);
    await fits("home card");
    await safeToSpendCard(page).getByRole("link", { name: "Your money" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your money" })).toBeVisible();
    await fits("your money: today");
    await checkA11y(`your money today at ${size.width}`);
    await page.getByRole("link", { name: "This month" }).click();
    await expect(page.getByLabel("Income each month")).toBeVisible();
    await fits("your money: this month");
    await checkA11y(`your money this month at ${size.width}`);
    await page.goto("/settings/accounts");
    await fits("accounts");
    await checkA11y(`accounts at ${size.width}`);
  });
}
