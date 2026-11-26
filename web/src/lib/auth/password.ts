// The password rule, the one source for both the forms and the API
// (lib/api/password.ts builds its schema from it, and the routes answer with
// passwordProblem's words): 8 to 72 characters. The upper limit is really 72
// bytes, as Supabase's bcrypt hashing ignores anything after that, so an
// accented letter or an emoji counts as 2 to 4.
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
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  // Within 72 characters but over 72 bytes (accented letters, emoji): a
  // character count would not help the student, so say only that.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return "That password is too long.";
  return null;
}

// What a field that sets a password shows, always for the current value:
// nothing before the student types, then the rule as a hint while it is not
// met, and once they have tried to submit, as an error. Either clears the
// moment the password fits.
export function passwordFeedback(password: string, submitted: boolean): { hint?: string; error?: string } {
  const problem = passwordProblem(password);
  if (!problem || (!submitted && password === "")) return {};
  return submitted ? { error: problem } : { hint: problem };
}

// A light check before sending. The API makes the real decision.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
