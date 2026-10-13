// Every screen address in one place, and the only places a visitor may be
// sent after signing in.
export const ROUTES = {
  cards: "/",
  signIn: "/sign-in",
  quiz: "/quiz",
  results: "/results",
  home: "/home",
  settings: "/settings",
  // Decides where a student lands after signing in.
  start: "/start",
} as const;

export function cardPath(cardId: string): string {
  return `/cards/${encodeURIComponent(cardId)}`;
}

const NEXT_ALLOW_LIST: readonly string[] = [ROUTES.quiz, ROUTES.results, ROUTES.home];

// A card page, for a visitor who pressed an issuer button while signed out.
const CARD_PATH = /^\/cards\/[a-z0-9-]{1,100}$/;

// Returns the path only when it is one this app chose. A `next` value read
// from the address bar is attacker-controlled, so anything else is dropped.
export function allowedNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (NEXT_ALLOW_LIST.includes(value) || CARD_PATH.test(value)) return value;
  return null;
}

export function signInPath(next: string | null): string {
  const allowed = allowedNext(next);
  return allowed ? `${ROUTES.signIn}?next=${encodeURIComponent(allowed)}` : ROUTES.signIn;
}

export function googleSignInPath(next: string | null): string {
  return `/api/v1/auth/google?next=${encodeURIComponent(allowedNext(next) ?? ROUTES.start)}`;
}
