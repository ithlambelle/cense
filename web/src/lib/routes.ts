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
} as const;

// Where a student marks what the issuer decided for one tracked card.
export function applicationPath(applicationId: string): string {
  return `/applications/${encodeURIComponent(applicationId)}`;
}

// The first-month plan for one approved card.
export function planPath(applicationId: string): string {
  return `${ROUTES.plan}?application=${encodeURIComponent(applicationId)}`;
}

export function cardPath(cardId: string): string {
  return `/cards/${encodeURIComponent(cardId)}`;
}

const NEXT_ALLOW_LIST: readonly string[] = [ROUTES.quiz, ROUTES.results, ROUTES.home];

// A card page, for a visitor who pressed an issuer button while signed out.
const CARD_PATH = /^\/cards\/[a-z0-9-]{1,100}$/;

// A tracked card's update screen (opened from Home), so a signed-out visitor
// returns to it after signing in.
const APPLICATION_PATH = /^\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/waiting)?$/;

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
