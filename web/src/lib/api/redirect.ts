// Where the Google sign-in route handlers send a student. Anything that is not
// a plain local path falls back to /start, which picks the right screen.
export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\t\n\r]/.test(value)) {
    return "/start";
  }

  return value;
}
