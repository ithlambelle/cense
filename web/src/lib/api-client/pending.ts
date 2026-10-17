// Endpoints the screens need that the backend does not have yet (plan section
// 6, specs C2 and C3 for Mabelle and Yunho). They are NOT part of the API
// contract: their shapes live here until the owners add them for real.
//
// pendingRequest calls the real path. While the route does not exist (404 or
// 501), it answers "unavailable" and the screen shows an honest "not
// available yet" state; it never pretends a save worked. Only in development,
// with NEXT_PUBLIC_CENSE_MOCKS=1, fixtures answer instead (loaded with a
// dynamic import, so they are not in a production bundle).
import { z } from "zod";

const isoDate = z.iso.date();

// C2: a reapply reminder email (D8).
export const reminderSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  remindOn: isoDate,
  createdAt: z.iso.datetime({ offset: true }),
});
export const createReminderSchema = z.strictObject({ applicationId: z.uuid(), remindOn: isoDate });

// C3: the first-month plan's three actions for the approved card.
export const planActionsSchema = z.strictObject({
  autopay: z.boolean(),
  plannedPurchase: z.boolean(),
  paymentReminder: z.boolean(),
});
export const planSchema = z.strictObject({
  applicationId: z.uuid(),
  actions: planActionsSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});
export const updatePlanSchema = z.strictObject({ actions: planActionsSchema.partial() });

// Mabelle's draft PR #24 (password sign-in). Same shapes as its contract;
// removed from here once #24 merges and the routes are in the real contract.
const email = z.email().max(254);
const newPassword = z.string().min(8).max(128);

const ENDPOINTS = {
  "POST /auth/password/signup": {
    request: z.strictObject({ email, password: newPassword }),
    response: z.strictObject({ status: z.enum(["signed_in", "check_email"]) }),
  },
  "POST /auth/password/signin": {
    request: z.strictObject({ email, password: z.string().min(1) }),
    response: z.strictObject({ status: z.literal("signed_in") }),
  },
  "POST /auth/password/reset": {
    request: z.strictObject({ email }),
    response: z.strictObject({ status: z.literal("check_email") }),
  },
  "POST /auth/password/reset/confirm": {
    request: z.strictObject({ password: newPassword }),
    response: z.strictObject({ status: z.literal("password_updated") }),
  },
  "GET /reminders": { response: z.strictObject({ reminders: z.array(reminderSchema) }) },
  "POST /reminders": { request: createReminderSchema, response: reminderSchema },
  "GET /plan": { response: planSchema },
  "PATCH /plan": { request: updatePlanSchema, response: planSchema },
} as const;

export type PendingEndpoint = keyof typeof ENDPOINTS;
type Endpoints = typeof ENDPOINTS;
type ResponseOf<E extends PendingEndpoint> = z.infer<Endpoints[E]["response"]>;
type RequestOf<E extends PendingEndpoint> = Endpoints[E] extends { request: z.ZodType } ? z.infer<Endpoints[E]["request"]> : undefined;

export type PendingResult<Data> =
  | { kind: "ok"; data: Data }
  // The backend route is not built yet.
  | { kind: "unavailable" }
  | { kind: "signed-out" }
  // `code` is the API's error code when it sent one (for example invalid_credentials).
  | { kind: "failed"; message: string; code?: string };

const FAILED_MESSAGE = "Something went wrong. Please try again.";
const OFFLINE_MESSAGE = "We couldn’t reach Cense. Check your connection and try again.";

function readError(payload: unknown): { code: string; message: string } | null {
  const parsed = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(payload);
  return parsed.success ? parsed.data.error : null;
}

export function mocksEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_CENSE_MOCKS === "1";
}

export async function pendingRequest<E extends PendingEndpoint>(
  endpoint: E,
  ...[body]: RequestOf<E> extends undefined ? [] : [RequestOf<E>]
): Promise<PendingResult<ResponseOf<E>>> {
  const spec = ENDPOINTS[endpoint];
  const [method, path] = endpoint.split(" ") as [string, string];

  if (mocksEnabled()) {
    const { mockPending, MockApiError } = await import("./pending-fixtures");
    try {
      const data = await mockPending(endpoint, body);
      return { kind: "ok", data: spec.response.parse(data) as ResponseOf<E> };
    } catch (error) {
      if (error instanceof MockApiError) return { kind: "failed", message: error.message, code: error.code };
      throw error;
    }
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { kind: "failed", message: OFFLINE_MESSAGE };
  }
  if (response.status === 404 || response.status === 501) return { kind: "unavailable" };
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = readError(payload);
    // A 401 from a sign-in route means wrong details, not an ended session.
    if (response.status === 401 && (!apiError || apiError.code === "unauthorized")) return { kind: "signed-out" };
    return { kind: "failed", message: apiError?.message ?? FAILED_MESSAGE, code: apiError?.code };
  }
  const parsed = spec.response.safeParse(payload);
  return parsed.success ? { kind: "ok", data: parsed.data as ResponseOf<E> } : { kind: "failed", message: FAILED_MESSAGE };
}
