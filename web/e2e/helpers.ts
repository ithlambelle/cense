// Shared steps for the Playwright journey tests.
import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import { QUESTIONS, type QuizAnswers } from "../src/lib/quiz/questions";
import { QUIZ_STEP_COUNT, SPENDING_COPY } from "../src/lib/quiz/spending";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// A unique address per test run, so every test starts with a fresh student.
export function uniqueEmail(journey: string): string {
  return `e2e-${journey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

// Issuer sites and other third-party pages are never loaded: anything that is
// not the local app or the local Supabase stack is answered with an empty stub
// page (navigations, so the tab keeps the address it was sent to) or aborted.
export async function blockExternalRequests(context: BrowserContext) {
  await context.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>External stub</title>" })
        : route.abort("blockedbyclient"),
  );
}

// Runs axe once per distinct screen in a test and expects no violations.
export function axeChecker(page: Page) {
  const seen = new Set<string>();
  return async function checkA11y(screen: string) {
    if (seen.has(screen)) return;
    seen.add(screen);
    // After a client-side navigation Next.js sets the new page's <title> a
    // moment later; on a fast runner axe could look in between (CI, Oct 25).
    await expect(page).toHaveTitle(/\S/);
    // Scrolled to the end first: content under the fixed bottom bar at the
    // current scroll counts as an obscured touch target, though a student only
    // ever taps it after scrolling it clear.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    await page.evaluate(() => window.scrollTo(0, 0));
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((node) => node.target.join(" ")),
    }));
    expect(summary, `axe violations on ${screen}`).toEqual([]);
  };
}

type MailpitList = { messages?: { ID: string; Snippet?: string }[] };

async function mailIds(email: string): Promise<Set<string>> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const list = (await response.json()) as MailpitList;
  return new Set((list.messages ?? []).map((m) => m.ID));
}

// Polls Mailpit for a 6-digit code in a message to `email` that was not there
// before (`seen`). Matched by message id, not time: the Docker VM's clock can
// drift a minute from the host's (it did on Oct 24), which made a time filter
// drop fresh codes.
async function codeFromMailpit(email: string, seen: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await response.json()) as MailpitList;
    const message = list.messages?.find((m) => !seen.has(m.ID));
    const code = message && /\b(\d{6})\b/.exec(message.Snippet ?? "")?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in code arrived in Mailpit for ${email}`);
}

// Signs up a new student through the real UI (email code) and waits for the
// screen /start sends them to. Runs axe on both sign-up steps.
export async function signUp(page: Page, email: string, checkA11y: (screen: string) => Promise<void>) {
  await page.goto("/sign-up");
  const emailField = page.getByLabel("Email");
  await expect(emailField).toBeEditable();
  await checkA11y("sign-up: email");
  await emailField.fill(email);
  const seen = await mailIds(email);
  await page.getByRole("button", { name: "Email me a code" }).click();

  const codeField = page.getByLabel("Verification code");
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  await checkA11y("sign-up: code");
  await codeField.fill(await codeFromMailpit(email, seen));
  await page.getByRole("button", { name: "Verify" }).click();

  await page.waitForURL((url) => !["/sign-up", "/sign-in", "/start"].includes(url.pathname));
  await expect(page.locator("h1", { hasNotText: "Hold tight!" }).first()).toBeVisible();
}

// The labels to tap, keyed by question field. Labels come from questions.ts.
export type QuizPicks = Partial<Record<keyof QuizAnswers, string>>;

export const LIKELY_FIT_PICKS: QuizPicks = {
  under21: "18 to 20",
  incomeBand: "Under $5k",
  student: "Yes",
  standing: "None",
  recentDenial: "No",
  canDeposit: "Yes",
};

// Taps one answer per question, in order, and runs axe on each question.
export async function takeQuiz(page: Page, picks: QuizPicks, checkA11y: (screen: string) => Promise<void>) {
  for (const [index, question] of QUESTIONS.entries()) {
    const heading = page.getByRole("heading", { level: 1, name: question.title });
    await expect(heading).toBeVisible();
    await expect(page.getByText(`Question ${index + 1} of ${QUIZ_STEP_COUNT}`)).toBeVisible();
    const label = picks[question.field];
    if (!label) throw new Error(`No answer picked for ${question.field}`);
    const answer = page.getByRole("group", { name: question.title }).getByRole("button", { name: label, exact: true });
    await expect(answer).toBeEnabled();
    await checkA11y(`quiz: question ${index + 1}`);
    await answer.click();
  }
  // The spending question is optional and not saved yet: skip it.
  await expect(page.getByRole("heading", { level: 1, name: SPENDING_COPY.title })).toBeVisible();
  await checkA11y("quiz: spending");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/results");
}

type SessionCookie = { access_token: string; expires_at: number } & Record<string, unknown>;

// @supabase/ssr keeps the session in one cookie, or in numbered chunks
// (name.0, name.1 ...) when it is long, as "base64-" plus base64url JSON.
async function sessionCookies(context: BrowserContext) {
  const chunks = (await context.cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  if (chunks.length === 0) throw new Error("No Supabase session cookie found");
  const raw = decodeURIComponent(chunks.map((cookie) => cookie.value).join(""));
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8")) as SessionCookie;
  return { chunks, session };
}

// When the session's access token expires (seconds since 1970).
export async function sessionExpiresAt(context: BrowserContext): Promise<number> {
  return (await sessionCookies(context)).session.expires_at;
}

// Makes the signed-in student's access token look an hour old: expires_at and
// the token's own exp claim are moved into the past. The refresh token is left
// alone, so the session proxy (src/proxy.ts) should refresh it on the next page.
export async function expireAccessToken(context: BrowserContext) {
  const { chunks, session } = await sessionCookies(context);
  const past = Math.floor(Date.now() / 1000) - 3600;
  const [header, payload, signature] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const expired: SessionCookie = {
    ...session,
    access_token: [header, Buffer.from(JSON.stringify({ ...claims, exp: past })).toString("base64url"), signature].join("."),
    expires_at: past,
  };
  const value = `base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`;
  // Written back under the same cookie names, split as evenly as the original.
  const size = Math.ceil(value.length / chunks.length);
  await context.addCookies(chunks.map((cookie, index) => ({ ...cookie, value: value.slice(index * size, (index + 1) * size) })));
}
