// Forgot password, end to end, as a student: the reset email, its link opened
// on another device, the new password, and logging in with it. Before this
// test the local recovery email carried only a 6-digit code while the app
// needs a link, a used or expired link landed on Forgot password with no word
// of why, and "This link has expired" could not be reached at all (audit
// H-P1-03): the route answers 401 sign_in_required, and the screen only
// treated a 401 "unauthorized" as an ended session. Walking it also showed the
// link never worked: Supabase marks the session a token_hash link opens "otp",
// and the route accepted only "recovery", so saving always said "Open a
// password reset link".
//
// Since the external audit of a8fe7d4 (login CSRF), opening the link signs
// no one in: it shows a confirm screen, and only its Continue button verifies
// the link. A mail scanner opening it no longer uses it up, and a link someone
// else asked for cannot swap a signed-in student into their account.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, mailIds, newEmail, signUp, uniqueEmail } from "./helpers";

const RESET_LINK = /\/reset-password\/confirm\?token_hash=[^&\s]+$/;

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// A separate browser with no session, as on the student's phone.
async function freshDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" });
  await blockExternalRequests(context);
  return context.newPage();
}

// The newest reset email's link for `email`, asked for from `page`'s browser.
async function resetLink(page: Page, email: string): Promise<string> {
  const seen = await mailIds(email);
  const asked = await page.request.post("/api/v1/auth/password/reset", { data: { email } });
  expect(asked.status()).toBe(200);
  const mail = await newEmail(email, seen);
  const link = mail.links.find((href) => RESET_LINK.test(href));
  expect(link, `reset link in ${JSON.stringify(mail.links)}`).toBeTruthy();
  return link!;
}

async function logInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use a password instead" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a student resets a forgotten password from the emailed link on another device, then logs in with it", async ({ page, browser }) => {
  const email = uniqueEmail("reset");
  // A made-up value, built at run time so it never sits in the repo as a literal.
  const newPassword = `reset-${Date.now().toString(36)}-ok`;
  await signUp(page, email, async () => {});

  const laptop = await freshDevice(browser);
  const checkA11y = axeChecker(laptop);
  await laptop.goto("/sign-in");
  await laptop.getByRole("button", { name: "Use a password instead" }).click();
  await laptop.getByRole("link", { name: "Forgot password?" }).click();
  await expect(laptop).toHaveURL(/\/forgot-password$/);
  await expect(laptop.getByRole("heading", { level: 1, name: "Forgot password?" })).toBeVisible();
  await checkA11y("forgot password");
  const seen = await mailIds(email);
  await laptop.getByLabel("Email").fill(email);
  await laptop.getByRole("button", { name: "Send link" }).click();
  await expect(laptop.getByRole("status")).toContainText("we sent it a link to set a new password");
  await checkA11y("forgot password: sent");

  // The email has a link back into this app, not a code.
  const mail = await newEmail(email, seen);
  expect(mail.subject).toBe("Reset your Cense password");
  const link = mail.links.find((href) => RESET_LINK.test(href));
  expect(link, `reset link in ${JSON.stringify(mail.links)}`).toBeTruthy();
  expect(new URL(link!).origin).toBe(new URL(laptop.url()).origin);

  // A mail scanner opens the link, and the older address the first emails
  // used, before the student does: neither uses it up.
  const scanner = await freshDevice(browser);
  const token = new URL(link!).searchParams.get("token_hash")!;
  for (const address of [link!, `/api/v1/auth/password/reset/verify?token_hash=${encodeURIComponent(token)}`]) {
    const opened = await scanner.request.get(address);
    expect(opened.status(), address).toBe(200);
    expect(await opened.text(), address).toContain("Reset your password");
  }

  // Opened on the phone, which never asked for it: a confirm screen first.
  const phone = await freshDevice(browser);
  const phoneA11y = axeChecker(phone);
  await phone.goto(link!);
  await expect(phone).toHaveURL(RESET_LINK);
  await expect(phone.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  await phoneA11y("reset password: confirm link");
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone).toHaveURL(/\/reset-password$/);
  await expect(phone.getByRole("heading", { level: 1, name: "Set a new password" })).toBeVisible();
  // The account is named, so a link meant for someone else is noticed.
  await expect(phone.getByText(`For the account ${email}`)).toBeVisible();
  await phoneA11y("reset password");
  await phone.getByLabel("New password", { exact: true }).fill(newPassword);
  await phone.getByLabel("Repeat password", { exact: true }).fill(newPassword);
  await phone.getByRole("button", { name: "Save password" }).click();
  await phone.waitForURL((url) => ["/home", "/results"].includes(url.pathname));

  // The new password works on a third browser.
  const other = await freshDevice(browser);
  await logInWithPassword(other, email, newPassword);
  await other.waitForURL((url) => ["/home", "/results"].includes(url.pathname));

  // Only a reset link's session can set a password here: not the email-code
  // session from before the reset email, and not a password sign-in.
  for (const [who, device] of [["email-code session", page], ["password sign-in", other]] as const) {
    await device.goto("/reset-password");
    await device.getByLabel("New password", { exact: true }).fill(`${newPassword}-2`);
    await device.getByLabel("Repeat password", { exact: true }).fill(`${newPassword}-2`);
    await device.getByRole("button", { name: "Save password" }).click();
    await expect(device.getByRole("heading", { level: 1, name: "This link has expired" }), who).toBeVisible();
  }
  const check = await freshDevice(browser);
  await logInWithPassword(check, email, newPassword);
  await check.waitForURL((url) => ["/home", "/results"].includes(url.pathname));

  // The link works once. Opened again, it says so and offers a new one.
  const again = await freshDevice(browser);
  await again.goto(link!);
  await again.getByRole("button", { name: "Continue" }).click();
  await expect(again).toHaveURL(/\/forgot-password\?error=invalid_link$/);
  await expect(again.getByText("That link has expired or was already used. Ask for a new one below.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Send link" })).toBeVisible();
  await axeChecker(again)("forgot password: link expired");
});

test("saving a new password with no reset session shows the expired-link screen, which leads to a new link", async ({ page }) => {
  const password = `reset-${Date.now().toString(36)}-ok`;
  await page.goto("/reset-password");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save password" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
  await axeChecker(page)("reset password: expired");
  await page.getByRole("link", { name: "Send a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
});

// Login CSRF (external audit of a8fe7d4): someone asks for a reset of their
// own account and sends the link to a signed-in student. Continue refuses,
// the student stays signed in as themselves, and Log out leads to a new link.
test("a reset link for another account never signs a signed-in student out of their own", async ({ page, browser }) => {
  const student = uniqueEmail("reset-victim");
  await signUp(page, student, async () => {});

  const attacker = await freshDevice(browser);
  const attackerEmail = uniqueEmail("reset-attacker");
  await signUp(attacker, attackerEmail, async () => {});
  const link = await resetLink(attacker, attackerEmail);

  await page.goto(link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Log out first" })).toBeVisible();
  await expect(page.getByText("You’re logged in to a different account. Log out, then ask for a new reset link.")).toBeVisible();
  await axeChecker(page)("reset password: another account");

  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(student);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});
