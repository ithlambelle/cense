// Development-only answers for the pending endpoints (see pending.ts). Loaded
// only when mocks are on. Kept per browser tab so a walkthrough behaves like
// the real thing. The import from pending.ts is type-only, so it adds no code.
import type { Plan, Reminder } from "./pending";

// CENSE_FIXTURE_SENTINEL: `npm run fixtures:check` (part of `npm run check`)
// fails if this string shows up in the browser bundle.
const FIXTURE_SENTINEL = "CENSE_FIXTURE_SENTINEL";

export class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MOCK_APPLICATION_ID = "00000000-0000-4000-8000-000000000001";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`cense:mock:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`cense:mock:${key}`, JSON.stringify(value));
  } catch {
    // Mocks only: losing state on reload is fine.
  }
}

export async function mockPending(endpoint: string, body: unknown): Promise<unknown> {
  const now = new Date().toISOString();
  switch (endpoint) {
    case "GET /reminders":
      return { reminders: read<Reminder[]>("reminders", []) };
    case "POST /reminders": {
      const input = body as { applicationId: string; remindOn: string };
      const reminder: Reminder = { id: crypto.randomUUID(), ...input, createdAt: now };
      write("reminders", [...read<Reminder[]>("reminders", []).filter((r) => r.applicationId !== input.applicationId), reminder]);
      return reminder;
    }
    case "GET /plan":
      return read<Plan>("plan", {
        applicationId: MOCK_APPLICATION_ID,
        actions: { autopay: false, plannedPurchase: false, paymentReminder: false },
        updatedAt: now,
      });
    case "PATCH /plan": {
      const current = (await mockPending("GET /plan", undefined)) as Plan;
      const next: Plan = { ...current, actions: { ...current.actions, ...(body as { actions: Partial<Plan["actions"]> }).actions }, updatedAt: now };
      write("plan", next);
      return next;
    }
    case "POST /auth/password/signup":
      // Mocks only: this email shows the account-already-exists state.
      if ((body as { email: string }).email === "taken@example.com") {
        throw new MockApiError(409, "account_exists", "An account already uses this email.");
      }
      return { status: "signed_in" };
    case "POST /auth/password/signin":
      // Mocks only: the password "wrong-password" shows the incorrect-details state.
      if ((body as { password: string }).password === "wrong-password") {
        throw new MockApiError(401, "invalid_credentials", "The email or password is incorrect.");
      }
      return { status: "signed_in" };
    case "POST /auth/password/reset":
      return { status: "check_email" };
    case "POST /auth/password/reset/confirm":
      return { status: "password_updated" };
    default:
      throw new Error(`${FIXTURE_SENTINEL}: no mock for ${endpoint}`);
  }
}
