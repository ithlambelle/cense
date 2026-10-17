// Development-only answers for the pending endpoints (see pending.ts). Loaded
// only when mocks are on. Kept per browser tab so a walkthrough behaves like
// the real thing. CENSE_FIXTURE_SENTINEL: a build check greps for this string
// to prove fixtures never reach a production bundle.
export const FIXTURE_SENTINEL = "CENSE_FIXTURE_SENTINEL";

type Reminder = { id: string; applicationId: string; remindOn: string; createdAt: string };
type Plan = {
  applicationId: string;
  actions: { autopay: boolean; plannedPurchase: boolean; paymentReminder: boolean };
  updatedAt: string;
};

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
    default:
      throw new Error(`${FIXTURE_SENTINEL}: no mock for ${endpoint}`);
  }
}
