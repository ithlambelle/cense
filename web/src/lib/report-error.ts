import { captureError } from "@/lib/analytics";

// The one place a screen records an unexpected error it caught: the browser
// console, and PostHog error tracking when the project token is set (only on
// Vercel Production). Pass the screen or function name, never student data.
export function reportError(where: string, error: unknown): void {
  console.error(`[cense] ${where}`, error);
  captureError(where, error);
}
