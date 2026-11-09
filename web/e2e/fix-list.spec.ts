// Flow F (the fix list) and the global changes, walked as a student: the
// denial plan's circles, the reapply reminder in step 5, the saved screen and
// its confirmation email, Profile's Log out and Switch account, Cards and Add
// card back to Profile, and the bottom bar fixed to the bottom.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { startFakeEmailServer } from "./support/fake-email-server";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, status: string, creditLimitCents: number | null = null) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status, creditLimitCents },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const circle = (page: Page, title: string) => page.getByRole("button", { name: `Done: ${title}` });

test("the denial plan: tap a circle to finish a step, and the reminder lives in step 5", async ({ page }) => {
  const checkA11y = axeChecker(page);
  const email = uniqueEmail("fix-plan");
  await signUp(page, email, async () => {});
  const id = await track(page, "rejected");

  await page.goto(`/denied/plan?application=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "A steady five-step plan" })).toBeVisible();
  await expect(page.getByText("0 of 5 done")).toBeVisible();
  // No step is pushed first, and no text button marks one.
  await expect(page.getByText("UP NEXT")).toHaveCount(0);
  await expect(page.getByText(/Mark as/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Set a 6-month reminder/ })).toHaveCount(0);
  await checkA11y("denied plan");

  // The circle marks the step, and it stays marked after a reload.
  await circle(page, "Read the issuer’s letter").click();
  await expect(page.getByText("1 of 5 done")).toBeVisible();
  await expect(circle(page, "Read the issuer’s letter")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByText("1 of 5 done")).toBeVisible();
  // Tapping the row opens its detail and marks nothing.
  await page.getByRole("button", { name: /^Check your credit reports/ }).click();
  await expect(page.getByRole("link", { name: /AnnualCreditReport.com/ })).toBeVisible();
  await expect(page.getByText("1 of 5 done")).toBeVisible();

  // Step 5: not set, then set from its own link.
  await expect(page.getByText("Reminder not set")).toBeVisible();
  await page.getByRole("link", { name: "Set a reminder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose when to check in" })).toBeVisible();
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reminder saved" })).toBeVisible();
  // No email stand-in runs for this test, so the confirmation is not sent and
  // the screen names the day instead of claiming an email.
  await expect(page.getByText(/^We’ll email you on /)).toBeVisible();
  await expect(page.getByText("We emailed you a confirmation.")).toHaveCount(0);
  await checkA11y("reminder saved");

  // Back to your plan: the plan, and Back from there never reopens the saved screen or the form.
  await page.getByRole("link", { name: "Back to your plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/plan\\?application=${id}$`));
  await expect(page.getByText(/^Reminder set for /)).toBeVisible();
  await expect(page.getByRole("link", { name: "Change date" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Reminder saved" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Choose when to check in" })).toHaveCount(0);
});

test.describe("the reapply reminder's confirmation email", () => {
  let fake: Awaited<ReturnType<typeof startFakeEmailServer>> | null = null;

  test.beforeAll(async () => {
    // Only where the app was started with the email variables pointing at the
    // stand-in (CI does; README): elsewhere the app skips the email.
    if (process.env.CI || process.env.E2E_CRON_SECRET) fake = await startFakeEmailServer();
  });

  test.afterAll(async () => {
    await fake?.close();
  });

  test("goes out once, on save, to the student, with a button to the plan", async ({ page }) => {
    test.skip(!fake, "Start the app with the reminder job's variables (README).");
    const email = uniqueEmail("fix-confirm");
    await signUp(page, email, async () => {});
    const id = await track(page, "rejected");
    await page.goto(`/denied/reminder?application=${id}`);
    await page.getByRole("button", { name: "Save reapply reminder" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reminder saved" })).toBeVisible();
    // Sent, so the saved screen says so; a reload names the day instead.
    await expect(page.getByText("We emailed you a confirmation.")).toBeVisible();
    await expect.poll(() => fake!.emailsTo(email).length).toBe(1);
    await page.reload();
    await expect(page.getByText(/^We’ll email you on /)).toBeVisible();
    const sent = fake!.emailsTo(email)[0];
    expect(sent.subject).toBe("Your reapply reminder is set");
    expect(sent.text).toContain("Change the date any time in your plan.");
    expect(sent.text).toContain(`/denied/plan?application=${id}`);
    // It is not a reminder row, so the daily limit and the job never see it.
    const reminders = (await (await page.request.get("/api/v1/reminders")).json()) as { reminders: { sentAt: string | null }[] };
    expect(reminders.reminders.every((r) => r.sentAt === null)).toBe(true);
  });
});

test("Profile: Cards and Add a card return to Profile, and Log out lands on Welcome back", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("fix-profile"), async () => {});
  await track(page, "approved", 50000);

  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Your card" })).toContainText("$500 limit");
  await checkA11y("profile");

  // Cards, opened from Profile, has a back arrow to Profile.
  await page.getByRole("link", { name: "Cards", exact: true }).click();
  await expect(page).toHaveURL(/\/cards\?from=account$/);
  await page.getByRole("link", { name: "Back to Your account" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // Add a card: Cancel returns to Profile, and Back then does not reopen the form.
  await page.getByRole("link", { name: "Add a card I already have" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a card you already have" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/home\/add-card/);

  // Log out is a full-width button with Switch account under it.
  await page.goto("/settings");
  const logOut = page.getByRole("button", { name: "Log out" });
  const main = await page.getByRole("main").boundingBox();
  const box = await logOut.boundingBox();
  expect(Math.round(box!.width)).toBe(Math.round(main!.width - 48));
  await expect(page.getByRole("button", { name: "Switch account" })).toBeVisible();
  await logOut.click();
  // Welcome back (F8): Penny and two outlined buttons, Google asking which account.
  await expect(page).toHaveURL(/\/signed-out$/);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await checkA11y("signed out");
  const google = page.getByRole("link", { name: "Continue with Google" });
  expect(await google.getAttribute("href")).toMatch(/^\/api\/v1\/auth\/google\?next=/);
  await page.getByRole("link", { name: "Continue with email" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the bottom bar stays fixed to the bottom of the screen, even on a short page", async ({ page }) => {
  await signUp(page, uniqueEmail("fix-nav"), async () => {});
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/learn");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    const box = (await nav.boundingBox())!;
    expect(Math.round(box.y + box.height), `bottom bar at ${width}`).toBe(900);
    await page.mouse.wheel(0, 2000);
    const after = (await nav.boundingBox())!;
    expect(Math.round(after.y + after.height), `bottom bar after scrolling at ${width}`).toBe(900);
  }
});
