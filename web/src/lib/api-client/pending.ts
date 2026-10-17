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

const ENDPOINTS = {
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
  | { kind: "failed"; message: string };

const FAILED_MESSAGE = "Something went wrong. Please try again.";
const OFFLINE_MESSAGE = "We couldn’t reach Cense. Check your connection and try again.";

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
    const { mockPending } = await import("./pending-fixtures");
    const data = await mockPending(endpoint, body);
    return { kind: "ok", data: spec.response.parse(data) as ResponseOf<E> };
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
  if (response.status === 401) return { kind: "signed-out" };
  if (!response.ok) return { kind: "failed", message: FAILED_MESSAGE };
  const parsed = spec.response.safeParse(await response.json().catch(() => null));
  return parsed.success ? { kind: "ok", data: parsed.data as ResponseOf<E> } : { kind: "failed", message: FAILED_MESSAGE };
}
