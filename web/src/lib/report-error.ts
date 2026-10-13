// The one place an unexpected error is recorded. It goes to the browser
// console for now; when the team picks a logging service, only this changes.
// Pass the screen or function name, never student data.
export function reportError(where: string, error: unknown): void {
  console.error(`[cense] ${where}`, error);
}
