// Every screen a student can reach, in every state that changes what it shows,
// grouped by the kind of student who sees it. The quality suite visits each
// one at each phone size. Add a screen here whenever a route or state is added.
import type { Page } from "@playwright/test";

import { CHIME, DISCOVER, lightStep, MATCH, patchApplication, PLATINUM, saveQuiz, signIn, track } from "./student";

export type Screen = {
  name: string;
  path: (ids: Ids) => string;
  // Puts the screen into a state that needs a tap (an open sheet, a revealed question).
  act?: (page: Page) => Promise<void>;
  // Only on some branches (a route an open pull request adds): skipped when it answers 404.
  optional?: boolean;
};

export type Ids = Record<string, string>;

export type Persona = {
  name: string;
  signedIn: boolean;
  setup?: (page: Page) => Promise<Ids>;
  screens: Screen[];
};

const tap = (name: string | RegExp) => async (page: Page) => {
  // Short timeout: a control missing on this branch skips the state instead of hanging.
  await page.getByRole("button", { name }).first().click({ timeout: 5_000 });
  // Move off it, so the screenshot and styles show the resting state, not hover.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
};

const inAYear = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
};

export const PERSONAS: Persona[] = [
  {
    name: "signed-out",
    signedIn: false,
    screens: [
      { name: "welcome", path: () => "/" },
      { name: "sign-up", path: () => "/sign-up" },
      { name: "sign-in", path: () => "/sign-in" },
      { name: "sign-in-password", path: () => "/sign-in", act: tap(/password/i) },
      { name: "forgot-password", path: () => "/forgot-password" },
      { name: "cards", path: () => "/cards" },
      { name: "card-student", path: () => `/cards/${DISCOVER.id}` },
      { name: "card-secured", path: () => "/cards/discover-it-secured-cash-back" },
      { name: "not-found", path: () => "/this-page-does-not-exist" },
    ],
  },
  {
    name: "new-student",
    signedIn: true,
    screens: [
      { name: "home-no-quiz", path: () => "/home" },
      { name: "quiz-question-1", path: () => "/quiz" },
      { name: "cards", path: () => "/cards" },
      { name: "card", path: () => `/cards/${DISCOVER.id}` },
      { name: "card-preapproval-sheet", path: () => `/cards/${DISCOVER.id}`, act: tap(/Check if you’re preapproved/) },
      { name: "card-apply-sheet", path: () => `/cards/${DISCOVER.id}`, act: tap(/^Apply on/) },
      { name: "account", path: () => "/settings" },
      { name: "add-card", path: () => "/home/add-card" },
    ],
  },
  {
    name: "quiz-started",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, { under21: true, incomeBand: "under_5k" });
      return {};
    },
    screens: [
      { name: "home-started", path: () => "/home" },
      { name: "quiz-resumed", path: () => "/quiz" },
      { name: "results-unfinished", path: () => "/results" },
    ],
  },
  {
    name: "matched",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, MATCH);
      return {};
    },
    screens: [
      { name: "results-likely-fit", path: () => "/results" },
      { name: "home-matched", path: () => "/home" },
      { name: "cards-with-match", path: () => "/cards" },
      { name: "quiz-retake", path: () => "/quiz" },
    ],
  },
  {
    name: "stretch",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, { ...MATCH, recentDenial: true });
      return {};
    },
    screens: [
      { name: "results-stretch", path: () => "/results" },
      { name: "home-stretch", path: () => "/home" },
    ],
  },
  {
    name: "no-card",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, { ...MATCH, incomeBand: "none" });
      return {};
    },
    screens: [
      { name: "results-not-yet", path: () => "/results" },
      { name: "home-no-card", path: () => "/home" },
    ],
  },
  {
    name: "applied",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, MATCH);
      return { app: await track(page, DISCOVER, "applied") };
    },
    screens: [
      { name: "home-applied", path: () => "/home" },
      { name: "mark-result", path: (ids) => `/applications/${ids.app}` },
      { name: "mark-result-approved-chosen", path: (ids) => `/applications/${ids.app}`, act: tap("I was approved") },
      { name: "mark-result-denied-chosen", path: (ids) => `/applications/${ids.app}`, act: tap("I was denied") },
      { name: "waiting", path: (ids) => `/applications/${ids.app}/waiting` },
      { name: "card-tracked-applied", path: () => `/cards/${DISCOVER.id}` },
    ],
  },
  {
    name: "approved",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, MATCH);
      return { app: await track(page, DISCOVER, "approved", 50000) };
    },
    screens: [
      { name: "home-celebration", path: (ids) => `/home?celebrate=${ids.app}` },
      { name: "home-approved", path: () => "/home" },
      { name: "home-limit-editing", path: () => "/home", act: tap("Edit credit limit") },
      { name: "card-tracked-approved", path: () => `/cards/${DISCOVER.id}` },
      { name: "mark-result-for-approved", path: (ids) => `/applications/${ids.app}` },
      { name: "payment-reminders", path: (ids) => `/applications/${ids.app}/reminders`, optional: true },
      { name: "first-month-plan-page", path: (ids) => `/plan?application=${ids.app}` },
      { name: "account-with-card", path: () => "/settings" },
    ],
  },
  {
    name: "approved-stars",
    signedIn: true,
    setup: async (page) => {
      const app = await track(page, DISCOVER, "approved", null);
      await lightStep(page, app, "first_month", "planned_purchase");
      await lightStep(page, app, "first_month", "payment_reminder");
      await patchApplication(page, app, { autopayStatus: "on" });
      return { app };
    },
    screens: [
      { name: "home-all-stars-no-limit", path: () => "/home" },
    ],
  },
  {
    name: "denied",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, MATCH);
      return { app: await track(page, DISCOVER, "rejected") };
    },
    screens: [
      { name: "home-denied-no-reason", path: () => "/home" },
      { name: "denial-options", path: (ids) => `/denied?application=${ids.app}` },
      { name: "denial-reasons-revealed", path: (ids) => `/denied?application=${ids.app}`, act: tap("Yes, I know the reason") },
      { name: "denial-plan", path: (ids) => `/denied/plan?application=${ids.app}` },
      { name: "reapply-reminder", path: (ids) => `/denied/reminder?application=${ids.app}` },
      { name: "contact-issuer", path: (ids) => `/denied/fixable?application=${ids.app}` },
      { name: "second-look", path: (ids) => `/denied/second-look?application=${ids.app}` },
      { name: "second-look-not-approved", path: (ids) => `/denied/second-look?application=${ids.app}`, act: tap("The decision didn’t change") },
      { name: "no-letter", path: (ids) => `/denied/no-letter?application=${ids.app}`, optional: true },
      { name: "card-tracked-denied", path: () => `/cards/${DISCOVER.id}` },
    ],
  },
  {
    name: "denied-with-reason",
    signedIn: true,
    setup: async (page) => {
      const app = await track(page, DISCOVER, "rejected");
      await patchApplication(page, app, { denialReason: "no_credit_history" });
      await lightStep(page, app, "denial", "read_letter");
      await lightStep(page, app, "denial", "check_reports");
      const reminder = await page.request.post("/api/v1/reminders", { data: { applicationId: app, remindOn: inAYear() } });
      return { app, reminder: reminder.ok() ? "yes" : "" };
    },
    screens: [
      { name: "home-denied-plan", path: () => "/home" },
      { name: "denial-plan-with-reason", path: (ids) => `/denied/plan?application=${ids.app}` },
      { name: "reminder-saved", path: (ids) => `/denied/reminder/saved?application=${ids.app}` },
    ],
  },
  {
    name: "several-cards",
    signedIn: true,
    setup: async (page) => {
      await saveQuiz(page, MATCH);
      await track(page, PLATINUM, "rejected");
      await track(page, CHIME, "applied");
      return { app: await track(page, DISCOVER, "approved", 50000) };
    },
    screens: [{ name: "home-several", path: () => "/home" }],
  },
];

export { signIn };
