// The ?error= values the Google sign-in callback sends to /sign-in. A Map, so
// a crafted value such as ?error=constructor finds nothing.
const GOOGLE_ERRORS = new Map([
  ["cancelled", "Google sign-in was canceled. Try again, or use an email code."],
  ["callback", "Google sign-in didn’t finish. Try again, or use an email code."],
]);

// The message for a failed Google sign-in, or null for any other value.
export function googleErrorMessage(errorKey: string | null): string | null {
  return errorKey ? (GOOGLE_ERRORS.get(errorKey) ?? null) : null;
}
