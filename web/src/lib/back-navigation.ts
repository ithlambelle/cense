import { ROUTES } from "@/lib/routes";

// Where the top-left back arrow goes (Global G1, decided 2026-11-08), as in
// Android's navigation principles and iOS navigation stacks: inside Cense it
// returns to the screen the student was actually on; it never leaves Cense.
// With no Cense screen behind this one (opened from an email, a typed address
// in a new tab, a reload as the first page) it goes to the screen's logical
// parent instead, replacing this entry, so the parent stands in for the
// history the student never had.

// Screens the arrow never returns to: signing in and out. A student who signed
// in to reach a screen goes to its parent, not back to the sign-in form.
const NEVER_BACK_TO: readonly string[] = [
  ROUTES.signIn,
  ROUTES.signUp,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.start,
  ROUTES.accountDeleted,
  ROUTES.signedOut,
];

// Only what the arrow needs from a session history entry (Navigation API).
export type HistoryEntry = { url: string | null };

// The Cense screen the student was on before this one, or null when there is
// none to go back to. `entries` are the tab's same-origin history entries, so
// a previous entry that exists is always a Cense screen.
export function previousScreen(entries: readonly HistoryEntry[], index: number, origin: string): URL | null {
  if (index < 1 || index >= entries.length) return null;
  const previous = entries[index - 1]?.url;
  const current = entries[index]?.url;
  if (!previous) return null;
  let url: URL;
  try {
    url = new URL(previous);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (url.pathname.startsWith("/api/") || NEVER_BACK_TO.includes(url.pathname)) return null;
  // The same address again (a reload pushed twice) would look like nothing happened.
  if (current && url.href === current) return null;
  return url;
}

// Names for the screens the arrow can return to, for screen readers ("Back to
// Home"). The screen shows only the arrow.
const SCREEN_NAMES: Record<string, string> = {
  [ROUTES.welcome]: "Welcome",
  [ROUTES.home]: "Home",
  [ROUTES.settings]: "Your account",
  [ROUTES.reminderSettings]: "Reminder settings",
  [ROUTES.privacy]: "Security and privacy",
  [ROUTES.cards]: "Cards",
  [ROUTES.results]: "Your match",
  [ROUTES.quiz]: "the quiz",
  [ROUTES.learn]: "Learn",
  [ROUTES.penny]: "Ask Penny",
  [ROUTES.plan]: "your plan",
  [ROUTES.denied]: "Denial options",
  [`${ROUTES.denied}/plan`]: "Plan",
  [ROUTES.addCard]: "Add a card",
  [ROUTES.safeToSpend]: "Safe to spend",
};

// One approved card's setup screens (US-10), by the names their own back
// controls use for them ("Back to Card setup", "Back to Your suggestion").
const SETUP_SCREEN_NAMES: Record<string, string> = {
  "": "Card setup",
  "/autopay": "Autopay steps",
  "/autopay/confirm": "Did you turn on autopay?",
  "/autopay/on": "Autopay is on",
  "/spend-limit": "Your credit limit",
  "/spend-limit/suggestion": "Your suggestion",
  "/spend-limit/pick": "Pick your limit",
};

export function screenName(url: URL): string | null {
  const known = SCREEN_NAMES[url.pathname];
  if (known) return known;
  if (/^\/cards\/[^/]+$/.test(url.pathname)) return "Card details";
  if (/^\/applications\/[^/]+$/.test(url.pathname)) return "Mark result";
  const setup = /^\/applications\/[^/]+\/setup((?:\/[a-z-]+)*)$/.exec(url.pathname)?.[1];
  if (setup !== undefined && SETUP_SCREEN_NAMES[setup]) return SETUP_SCREEN_NAMES[setup];
  // A Learn topic by its slug's words, as its heading says ("student-loans" is
  // "Student loans"), without loading every answer into each screen.
  const topic = /^\/learn\/([a-z-]+)$/.exec(url.pathname)?.[1];
  if (topic) return topic[0].toUpperCase() + topic.slice(1).replaceAll("-", " ");
  return null;
}

// The minimal Navigation API surface used here. Browsers without it (older
// than Chrome 102, Safari 26.2, Firefox 147) fall back to the parent.
type NavigationLike = {
  entries(): HistoryEntry[];
  currentEntry: { index: number } | null;
  addEventListener(type: "currententrychange", listener: () => void): void;
  removeEventListener(type: "currententrychange", listener: () => void): void;
};

export function browserNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  return navigation && typeof navigation.entries === "function" ? navigation : null;
}

// The previous Cense screen in this tab right now, or null.
export function currentPreviousScreen(): URL | null {
  const navigation = browserNavigation();
  if (!navigation?.currentEntry) return null;
  return previousScreen(navigation.entries(), navigation.currentEntry.index, window.location.origin);
}

// True when the screen behind this one is `href` itself. A button that leads
// to the screen the student just came from then goes back instead of
// replacing: replacing would leave that screen in the history twice, and
// Back from it would seem to do nothing.
export function previousScreenIs(href: string): boolean {
  const previous = currentPreviousScreen();
  if (!previous) return false;
  const target = new URL(href, window.location.origin);
  return previous.pathname === target.pathname && previous.search === target.search;
}
