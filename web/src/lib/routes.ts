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
  // Penny's starters, the topics and Ask Penny (Flow 5).
  learn: "/learn",
  penny: "/learn/penny",
} as const;

// Keeps the tracked card with the student as they move between screens.
function withApplication(path: string, applicationId: string | null): string {
  return applicationId ? `${path}?application=${encodeURIComponent(applicationId)}` : path;
}

// Where a student marks what the issuer decided for one tracked card. `from`
// works like the card page's: "card" means it was opened from that card's page.
export type ApplicationOrigin = "card";

export function applicationPath(applicationId: string, from?: ApplicationOrigin): string {
  const path = `/applications/${encodeURIComponent(applicationId)}`;
  return from ? `${path}?from=${from}` : path;
}

// "I haven’t heard yet" for one tracked card.
export function waitingPath(applicationId: string): string {
  return `${applicationPath(applicationId)}/waiting`;
}

// Home right after Mark result saves a new approval. Home celebrates that
// card once and drops the flag from the address, so a reload is calm. There
// is no approved_at column, so this arrival is the only time the date is known.
export const CELEBRATE_PARAM = "celebrate";

export function celebratePath(applicationId: string): string {
  return `${ROUTES.home}?${CELEBRATE_PARAM}=${encodeURIComponent(applicationId)}`;
}

// The first-month plan for one approved card.
export function planPath(applicationId: string): string {
  return withApplication(ROUTES.plan, applicationId);
}

// The rejection guide's screens, starting from Denial Options.
const DENIED_STEPS = {
  options: ROUTES.denied,
  plan: `${ROUTES.denied}/plan`,
  noLetter: `${ROUTES.denied}/no-letter`,
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

// Mark result's back arrow. "card" returns to the tracked card's page, given
// only when that card is in the catalog. Anything else goes Home.
export function applicationBackLink(from: string | string[] | undefined, cardId: string | null): { href: string; label: string } {
  if (from === "card" && cardId) return { href: cardPath(cardId), label: "Card details" };
  return { href: ROUTES.home, label: "Home" };
}

// One Learn topic's checked questions (Flow 5, A1).
export function learnTopicPath(topic: string): string {
  return `${ROUTES.learn}/${encodeURIComponent(topic)}`;
}

// Ask Penny, showing one checked answer when `answer` is given. `from` is
// where it was opened: "learn", or a topic's slug. Its back arrow returns there.
export function pennyPath(answer?: string, from?: string): string {
  const params = new URLSearchParams();
  if (answer) params.set("answer", answer);
  if (from) params.set("from", from);
  const query = params.toString();
  return query ? `${ROUTES.penny}?${query}` : ROUTES.penny;
}

const NEXT_ALLOW_LIST: readonly string[] = [ROUTES.quiz, ROUTES.results, ROUTES.home, ROUTES.learn, ROUTES.penny];

// A Learn topic page, so a signed-out visitor returns to it after signing in.
const LEARN_TOPIC_PATH = /^\/learn\/[a-z-]{1,40}$/;

// A card page, for a visitor who pressed an issuer button while signed out.
const CARD_PATH = /^\/cards\/[a-z0-9-]{1,100}$/;

// A tracked card's update screen (opened from Home), so a signed-out visitor
// returns to it after signing in.
const APPLICATION_PATH = /^\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/waiting)?$/;

// Returns the path only when it is one this app chose. A `next` value read
// from the address bar is attacker-controlled, so anything else is dropped.
export function allowedNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (NEXT_ALLOW_LIST.includes(value) || CARD_PATH.test(value) || APPLICATION_PATH.test(value) || LEARN_TOPIC_PATH.test(value)) {
    return value;
  }
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
