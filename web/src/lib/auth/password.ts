// Client checks for the password forms. They mirror the API in PR #24 (8 to
// 128 characters) and NIST SP 800-63B, which says verifiers shall not impose
// composition rules such as requiring a number
// (https://pages.nist.gov/800-63-4/sp800-63b.html). The frame's "Try 8+
// characters, with a number" is replaced for that reason (flagged to design).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

// A light check before sending. The API makes the real decision.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
