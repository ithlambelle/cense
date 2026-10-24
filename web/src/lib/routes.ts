// Every screen address in one place, and the only places a visitor may be
// sent after signing in.
export const ROUTES = {
  welcome: "/",
  cards: "/cards",
  signIn: "/sign-in",
  signUp: "/sign-up",
  quiz: "/quiz",
  results: "/results",
  home: "/home",
  settings: "/settings",
  // Decides where a student lands after signing in.
  start: "/start",
  // The rejection guide (Figma Denial Overview frames).
  denied: "/denied",
  // The first-month plan for an approved card.
  plan: "/plan",
  // For a student who already has a card.
  addCard: "/home/add-card",
  forgotPassword: "/forgot-password",
  // Opened from the password reset email.
  resetPassword: "/reset-password",
} as const;

// Keeps the tracked card with the student as they move between screens.
function withApplication(path: string, applicationId: string | null): string {
  return applicationId ? `${path}?application=${encodeURIComponent(applicationId)}` : path;
}

// Where a student marks what the issuer decided for one tracked card.
export function applicationPath(applicationId: string): string {
  return `/applications/${encodeURIComponent(applicationId)}`;
}

// "I haven’t heard yet" for one tracked card.
export function waitingPath(applicationId: string): string {
  return `${applicationPath(applicationId)}/waiting`;
}

// Payment reminders for one approved card (US-08): its closing and due days
// and the reminder emails. Home's "Set a payment reminder" row opens it.
export function paymentRemindersPath(applicationId: string): string {
  return `${applicationPath(applicationId)}/reminders`;
}

// The first-month plan for one approved card.
export function planPath(applicationId: string): string {
  return withApplication(ROUTES.plan, applicationId);
}

// The rejection guide's screens, starting from Denial Options.
const DENIED_STEPS = {
  options: ROUTES.denied,
  plan: `${ROUTES.denied}/plan`,
  fixable: `${ROUTES.denied}/fixable`,
  reminder: `${ROUTES.denied}/reminder`,
  reminderSaved: `${ROUTES.denied}/reminder/saved`,
  secondLook: `${ROUTES.denied}/second-look`,
} as const;

export type DeniedStep = keyof typeof DENIED_STEPS;

// One rejection guide screen for a tracked card. Without a card the screens
// still open, and ask the student to start from the card on Home.
export function deniedPath(step: DeniedStep, applicationId: string | null): string {
  return withApplication(DENIED_STEPS[step], applicationId);
}

// Where a card page was opened from. Its back arrow returns there instead of
// always to the card list: in solution interviews (2026-10-17, 2026-10-18)
// students who opened their match could not get back to it.
export type CardOrigin = "results" | "home";

export function cardPath(cardId: string, from?: CardOrigin): string {
  const path = `/cards/${encodeURIComponent(cardId)}`;
  return from ? `${path}?from=${from}` : path;
}

// The card page's back arrow for each origin. Anything else, including a
// hand-typed value, falls back to the card list.
export function cardBackLink(from: string | string[] | undefined): { href: string; label: string } {
  if (from === "results") return { href: ROUTES.results, label: "Your match" };
  if (from === "home") return { href: ROUTES.home, label: "Home" };
  return { href: ROUTES.cards, label: "Cards" };
}

const NEXT_ALLOW_LIST: readonly string[] = [ROUTES.quiz, ROUTES.results, ROUTES.home];

// A card page, for a visitor who pressed an issuer button while signed out.
const CARD_PATH = /^\/cards\/[a-z0-9-]{1,100}$/;

// A tracked card's screens opened from Home (update, waiting, payment
// reminders), so a signed-out visitor returns to the one they were on.
const APPLICATION_PATH = /^\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/waiting|\/reminders)?$/;

// Returns the path only when it is one this app chose. A `next` value read
// from the address bar is attacker-controlled, so anything else is dropped.
export function allowedNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (NEXT_ALLOW_LIST.includes(value) || CARD_PATH.test(value) || APPLICATION_PATH.test(value)) return value;
  return null;
}

export function signInPath(next: string | null): string {
  const allowed = allowedNext(next);
  return allowed ? `${ROUTES.signIn}?next=${encodeURIComponent(allowed)}` : ROUTES.signIn;
}

export function signUpPath(next: string | null): string {
  const allowed = allowedNext(next);
  return allowed ? `${ROUTES.signUp}?next=${encodeURIComponent(allowed)}` : ROUTES.signUp;
}

export function googleSignInPath(next: string | null): string {
  return `/api/v1/auth/google?next=${encodeURIComponent(allowedNext(next) ?? ROUTES.start)}`;
}
