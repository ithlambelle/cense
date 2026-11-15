// A linked student deletes their account against the local stack and the
// stand-in Plaid server. No hosted account or real bank is involved.
import type { Server } from "node:http";

import { expect, test } from "@playwright/test";

import { blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { asStudent } from "./support/data-api";
import {
  behavior,
  issuedAccessTokens,
  removedAccessTokens,
  resetFakePlaid,
  startFakePlaid,
} from "./support/fake-plaid";

let plaid: Server;

test.beforeAll(async () => {
  plaid = await startFakePlaid();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => plaid.close(() => resolve()));
});

test.beforeEach(async ({ context }) => {
  resetFakePlaid();
  await blockExternalRequests(context);
});

test("account deletion succeeds while Plaid is down and the daily cron removes the queued Item", async ({ page, context }) => {
  await signUp(page, uniqueEmail("delete-linked"), async () => {});
  const linked = await page.request.post("/api/v1/bank-link", {
    data: { publicToken: "public-sandbox-good" },
  });
  expect(linked.status(), await linked.text()).toBe(201);
  const token = issuedAccessTokens.at(-1)!;
  expect((await asStudent(context, { table: "bank_links" })).body).toHaveLength(1);

  await page.goto("/settings/privacy");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(650);

  behavior.remove = "down";
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  expect(removedAccessTokens).not.toContain(token);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);

  behavior.remove = "ok";
  const secret = process.env.E2E_CRON_SECRET;
  if (!secret) throw new Error("E2E_CRON_SECRET is required for cleanup journey");
  const cleaned = await page.request.get("/api/v1/cron/reminders", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(cleaned.status(), await cleaned.text()).toBe(200);
  expect((await cleaned.json()).plaidCleanup.removed).toBeGreaterThanOrEqual(1);
  expect(removedAccessTokens).toContain(token);
});
