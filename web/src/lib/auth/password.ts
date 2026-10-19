// Client checks for the password forms. They mirror the API's 72-byte limit.
// NIST SP 800-63B-4
// (https://pages.nist.gov/800-63-4/sp800-63b.html) says verifiers shall not
// impose composition rules such as requiring a number, so the frame's "Try 8+
// characters, with a number" is replaced (flagged to design). The same
// guideline sets 15 characters as the minimum for a password used on its own,
// so 8 falls short of it; raising it is a change to #24 first (flagged to Ben).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `Use a password of ${PASSWORD_MAX} bytes or fewer.`;
  return null;
}

// A light check before sending. The API makes the real decision.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
