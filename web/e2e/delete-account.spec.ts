// Delete my account (S28), as a student: Your account, Security and privacy,
// the confirm sheet, then a signed-out landing. Afterwards nothing of theirs
// is left: the API refuses the old session, and the database, asked straight
// with the old access token, holds no row for them in any table. Runs
// against the local Supabase stack only (the app needs its service role key,
// web/.env.local, as in CI).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { accessToken, axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };
const CHIME = { cardId: "chime-card", cardName: "Chime Card" };
const MATCH = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const TABLES = ["card_applications", "profiles", "quiz_drafts", "recommendations", "issuer_clicks", "reminders", "plan_steps"] as const;
const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// The database as the student, with the public key and their own token: what
// any student could do from their browser's devtools.
function databaseAs(token: string) {
  let file = "";
  try {
    file = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  } catch {}
  const read = (name: string) => process.env[name] ?? new RegExp(`^${name}=(.*)$`, "m").exec(file)?.[1]?.trim();
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const key = read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Set the local stack's URL and publishable key in web/.env.local (README).");
  if (new URL(url).hostname !== "127.0.0.1") throw new Error(`Refusing to run: ${url} is not the local stack.`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}

async function rowsPerTable(token: string): Promise<Record<string, number>> {
  const db = databaseAs(token);
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select("student_id");
    expect(error, table).toBeNull();
    counts[table] = data?.length ?? 0;
  }
  return counts;
}

// A student with a row in every table: a saved quiz and its match, an approved
// card with its days (which schedules reminders) and a first-month step, a
// denied card with a reapply reminder, and an issuer link opened.
async function studentWithData(page: Page, journey: string) {
  const email = uniqueEmail(journey);
  await signUp(page, email, async () => {});
  expect((await page.request.put("/api/v1/quiz", { data: { answers: MATCH } })).status()).toBe(200);
  await page.goto("/results");
  await expect(page.getByRole("heading", { level: 1, name: "Here’s your match" })).toBeVisible();
  const post = async (data: object) => {
    const response = await page.request.post("/api/v1/applications", { data });
    expect(response.status(), await response.text()).toBe(201);
    return ((await response.json()) as { id: string }).id;
  };
  const approved = await post({ ...DISCOVER, status: "approved", creditLimitCents: 50000 });
  const rejected = await post({ ...CHIME, status: "rejected", creditLimitCents: null });
  expect((await page.request.patch(`/api/v1/applications/${approved}`, { data: { statementClosingDay: 12, paymentDueDay: 9 } })).status()).toBe(200);
  expect((await page.request.put(`/api/v1/applications/${approved}/plans/first_month/steps/planned_purchase`)).status()).toBe(201);
  const remindOn = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await page.request.post("/api/v1/reminders", { data: { applicationId: rejected, remindOn } })).status()).toBe(201);
  expect((await page.request.post("/api/v1/issuer-clicks", { data: { cardId: DISCOVER.cardId, kind: "apply" } })).status()).toBe(201);
  const me = (await (await page.request.get("/api/v1/me")).json()) as { id: string };
  return { email, id: me.id };
}

async function openPrivacy(page: Page) {
  await page.goto("/home");
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await page.getByRole("link", { name: "Security and privacy" }).click();
  await expect(page).toHaveURL(/\/settings\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Security and privacy" })).toBeVisible();
}

test("a student deletes their account: confirm, signed out, and nothing of theirs is left", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  const { email, id } = await studentWithData(page, "delete");
  const token = await accessToken(page.context());
  const before = await rowsPerTable(token);
  for (const table of TABLES) expect(before[table], `before: ${table}`).toBeGreaterThan(0);
  const oldSession = await page.context().storageState();

  await openPrivacy(page);
  await checkA11y("security and privacy");
  const sheet = page.getByRole("dialog", { name: "Delete your account?" });

  // Keep my account, and Escape, both close the sheet and delete nothing.
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("listitem")).toHaveCount(3);
  await checkA11y("delete account: confirm");
  await sheet.getByRole("button", { name: "Keep my account" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  expect((await page.request.get("/api/v1/me")).status()).toBe(200);

  // A deletion with no answer says so, and the account is still there.
  await page.route("**/api/v1/me", (route) => (route.request().method() === "DELETE" ? route.abort("failed") : route.fallback()));
  await page.getByRole("button", { name: "Delete my account" }).click();
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(/^We couldn’t reach Cense/);
  expect((await page.request.get("/api/v1/me")).status()).toBe(200);
  expect(await rowsPerTable(token)).toEqual(before);
  await page.unroute("**/api/v1/me");

  // Delete: one request, then the signed-out landing.
  const deletes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletes.push(new URL(r.url()).pathname);
  });
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your account is deleted" })).toBeVisible();
  expect(deletes).toEqual(["/api/v1/me"]);
  await checkA11y("account deleted");

  // Signed out here, and the old session is refused everywhere.
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);
  const oldBrowser = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: oldSession });
  expect((await oldBrowser.request.get("/api/v1/me")).status()).toBe(401);
  expect((await oldBrowser.request.get("/api/v1/applications")).status()).toBe(401);
  await oldBrowser.close();

  // The database itself, asked with the old token: no row in any table.
  const after = await rowsPerTable(token);
  expect(after).toEqual(Object.fromEntries(TABLES.map((table) => [table, 0])));

  // The landing leads back to Welcome, and the email can start over.
  await page.goto("/account-deleted");
  await page.getByRole("link", { name: "Back to Cense" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signUp(page, email, async () => {});
  await expect(page.getByRole("heading", { name: "6 questions to your first card" })).toBeVisible();
  const again = (await (await page.request.get("/api/v1/me")).json()) as { id: string };
  expect(again.id).not.toBe(id);
  expect(((await (await page.request.get("/api/v1/applications")).json()) as { applications: unknown[] }).applications).toEqual([]);

  // Signed in, the landing is not shown: it would not be true.
  await page.goto("/account-deleted");
  await expect(page).toHaveURL(/\/home$/);
});

test("signed out, Security and privacy and the delete request are refused", async ({ page }) => {
  await page.goto("/settings/privacy");
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await page.request.delete("/api/v1/me")).status()).toBe(401);
});

for (const size of SIZES) {
  test(`at ${size.width}x${size.height} Security and privacy, the confirm sheet and the landing fit`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUp(page, uniqueEmail(`delete-${size.width}`), async () => {});
    await openPrivacy(page);
    const fits = async (what: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${what}: sideways scroll`).toBeLessThanOrEqual(0);
    };
    await fits("security and privacy");
    const link = page.getByRole("button", { name: "Delete my account" });
    expect((await link.boundingBox())!.height, "Delete my account: tap target").toBeGreaterThanOrEqual(44);
    await link.click();
    const sheet = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(sheet).toBeVisible();
    for (const name of ["Delete my account", "Keep my account"]) {
      const button = sheet.getByRole("button", { name });
      // Once the sheet has finished sliding up.
      await expect.poll(async () => {
        const box = (await button.boundingBox())!;
        return box.y + box.height;
      }, { message: `${name}: inside the screen` }).toBeLessThanOrEqual(size.height);
      expect((await button.boundingBox())!.height, `${name}: tap target`).toBeGreaterThanOrEqual(44);
    }
    await fits("delete account: confirm");
    await sheet.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your account is deleted" })).toBeVisible();
    await fits("account deleted");
  });
}
