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

  // How we got this: each step of the sum, in plain words.
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
  await expect(page).toHaveURL(/\/safe-to-spend$/);
  await expect(page.getByRole("heading", { level: 1, name: "How we got this" })).toBeVisible();
  const sum = page.getByRole("list", { name: "The sum" });
  await expect(sum.getByRole("listitem").filter({ hasText: "Cash in checking" })).toContainText("$1,240");
  await expect(sum.getByRole("listitem").filter({ hasText: "Card balances" })).toContainText("$310");
  await expect(sum.getByRole("listitem").filter({ hasText: "Bills you cover" })).toContainText("$690");
  await expect(sum.getByRole("listitem").filter({ hasText: "Set aside" })).toContainText("$50");
  await expect(sum.getByRole("listitem").filter({ hasText: "Left for 30 days" })).toContainText("$190");
  await expect(sum.getByRole("listitem").filter({ hasText: "Safe to spend a day" })).toContainText(DAILY);
  const accounts = page.getByRole("list", { name: "Accounts from First Platypus Bank" });
  await expect(accounts.getByRole("listitem").filter({ hasText: "Plaid Saving" })).toContainText("Not counted");
  // Loans are never read into Cense.
  await expect(accounts).not.toContainText("Student Loan");
  await checkA11y("safe to spend: how we got this");

  // Change an answer: tuition becomes mine at $100, so 90 left, $3 a day.
  // The saved answers are already picked, so Continue moves straight on.
  await page.getByRole("link", { name: "Change your answers" }).click();
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
  // Back returns to How we got this, where the change started.
  await page.goBack();
  await expect(page).toHaveURL(/\/safe-to-spend$/);
  await expect(page.getByRole("heading", { level: 1, name: "How we got this" })).toBeVisible();
  await page.goto("/home");

  // Back from How we got this returns Home.
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
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
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
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
  await expect(page.getByRole("list", { name: "The sum" })).toContainText(DAILY);
  const opened = await page.evaluate(() => (window as unknown as { __fakePlaidOpened: { token: string }[] }).__fakePlaidOpened);
  expect(opened.at(-1)?.token).toContain("update");
  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText(DAILY);
});

test("when the bank link is gone at Plaid, Home stops showing the number and the student connects again", async ({ page }) => {
  await linkedStudent(page, "sts-relink");
  behavior.accounts = "gone";
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Your bank connection ended.")).toBeVisible();

  await page.goto("/home");
  await expect(safeToSpendCard(page)).toContainText("Your bank connection ended.");
  await expect(safeToSpendCard(page)).not.toContainText(DAILY);
  await safeToSpendCard(page).getByRole("link", { name: "Connect again" }).click();

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
  rings["How we got this"] = await tabTo(page, "How we got this");
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How we got this" })).toBeVisible();
  rings["Change your answers"] = await tabTo(page, "Change your answers");
  await page.getByRole("button", { name: "Disconnect bank" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  rings["my.plaid.com"] = await tabTo(page, "my.plaid.com");
  behavior.accounts = "login_required";
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Refresh" }).click();
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
  await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();

  // Plaid down: nothing changes, and the student is told.
  behavior.remove = "down";
  await page.getByRole("button", { name: "Disconnect bank" }).click();
  const sheet = page.getByRole("dialog", { name: "Disconnect your bank?" });
  await expect(sheet).toContainText("my.plaid.com");
  await checkA11y("safe to spend: disconnect sheet");
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
  for (const table of ["bank_links", "bank_balances", "bill_coverage"]) {
    const rows = await asStudent(context, { table });
    expect(rows, table).toEqual({ status: 200, body: [] });
  }
  expect(await asStudent(context, { rpc: "bank_link_secret" })).toEqual({ status: 200, body: [] });

  // A reload does not bring anything back, and the student can link again.
  await page.reload();
  await expect(page.getByRole("region", { name: "See what’s safe to spend" })).toBeVisible();
});

test("signed out: the screens send to sign-in and the API refuses", async ({ page }) => {
  for (const path of ["/safe-to-spend", "/safe-to-spend/connect", "/safe-to-spend/setup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  }
  expect((await page.request.get("/api/v1/safe-to-spend")).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link/link-token")).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link", { data: { publicToken: "public-sandbox-good" } })).status()).toBe(401);
  expect((await page.request.post("/api/v1/bank-link/refresh")).status()).toBe(401);
  expect((await page.request.delete("/api/v1/bank-link")).status()).toBe(401);
  expect((await page.request.put("/api/v1/safe-to-spend/answers", { data: {} })).status()).toBe(401);
  expect(received).toEqual([]);
});

test("another student sees none of the first student's bank data, in the app or through the Data API", async ({ page, context, browser }) => {
  await linkedStudent(page, "sts-owner");
  const ownerToken = issuedAccessTokens.at(-1)!;

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

  for (const table of ["bank_links", "bank_balances", "bill_coverage"]) {
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
    await safeToSpendCard(page).getByRole("link", { name: "How we got this" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "How we got this" })).toBeVisible();
    await fits("how we got this");
    await checkA11y(`how we got this at ${size.width}`);
  });
}
