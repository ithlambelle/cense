// Created with Claude Code (2026-11-26). The sign-in code limit, as a student
// and as a script, against the local stack: after 5 wrong codes the code is
// dead and the screen says to get a new one; Resend email brings 5 more tries
// and the new code signs in; 50 parallel guesses reach Supabase only 5 times.
// Before this, a testathon script made 110 guesses at one code (60 in a row,
// then 50 in parallel) and every one was checked.
import { expect, test } from "@playwright/test";

import { blockExternalRequests, codeFromMailpit, mailIds, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

const otherThan = (code: string) => (code === "000000" ? "111111" : "000000");

test("after 5 wrong codes the student is told to get a new one, and the new code signs them in", async ({ page }) => {
  // The Resend wait is a minute; the test moves the page's clock instead of waiting.
  await page.clock.install();
  const email = uniqueEmail("code-limit");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  let seen = await mailIds(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  const first = await codeFromMailpit(email, seen);

  const codeField = page.getByLabel("Verification code");
  for (let i = 1; i <= 5; i++) {
    await codeField.fill(otherThan(first));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("The code is wrong or expired. Request a new one.")).toBeVisible();
    await codeField.fill("");
  }

  // The sixth try is refused even with the right code.
  await codeField.fill(first);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("Too many wrong codes. Tap Resend email for a new one.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/sign-in");

  // A second at a time, so the countdown can render between ticks.
  for (let tick = 0; tick < 61; tick++) await page.clock.runFor(1_000);
  // The page's clock moved, Supabase's did not: it allows one email per
  // second locally (max_frequency), so the test waits that out for real.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  seen = await mailIds(email);
  await page.getByRole("button", { name: "Resend email" }).click();
  await expect(page.getByText("We sent a new code.")).toBeVisible();
  const second = await codeFromMailpit(email, seen);
  await codeField.fill(second);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => url.pathname !== "/sign-in");
});

test("50 parallel guesses at one code reach Supabase at most 5 times, and the code is then dead", async ({ request }) => {
  const email = uniqueEmail("code-race");
  const seen = await mailIds(email);
  expect((await request.post("/api/v1/auth/email", { data: { email } })).status()).toBe(200);
  const code = await codeFromMailpit(email, seen);

  const answers = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const response = await request.post("/api/v1/auth/email/verify", { data: { email, code: otherThan(code) } });
      return `${response.status()} ${((await response.json()) as { error?: { code: string } }).error?.code}`;
    }),
  );
  const tally = Object.fromEntries([...new Set(answers)].map((answer) => [answer, answers.filter((a) => a === answer).length]));
  // Checked by Supabase: exactly 5. The rest are refused first, by this limit
  // or by the older 10-in-10-minutes limit per email.
  expect(tally["401 invalid_code"], JSON.stringify(tally)).toBe(5);
  expect(answers.every((a) => ["401 invalid_code", "401 code_used_up", "429 rate_limited"].includes(a)), JSON.stringify(tally)).toBe(true);

  const right = await request.post("/api/v1/auth/email/verify", { data: { email, code } });
  expect(right.status()).not.toBe(200);
});
