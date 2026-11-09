import type { SnoozeChoice } from "@/lib/api/reminders";

import { apiRequest, failureMessage, isUnauthorized, type ApiFailure } from "./client";
import type { Reminder } from "./reminders";

// The in-app reminder actions in Updates (Flow B): I paid it, Snooze, Dismiss
// for this billing cycle, Mark all read.

// One list of choices, the API schema's.
export type { SnoozeChoice };

export type UpdateResult<T> = { kind: "ok"; data: T } | { kind: "signed-out" } | { kind: "failed"; message: string };

export const SNOOZE_PAST_DUE = "That time is after the due date. Pick another.";
export const REMINDER_DONE = "This reminder is already done. Refresh to see it.";
export const REMINDER_GONE = "We couldn’t find this reminder. Refresh Updates.";

function failure(result: ApiFailure): UpdateResult<never> {
  if (isUnauthorized(result)) return { kind: "signed-out" };
  if (result.kind === "api" && result.status === 404) return { kind: "failed", message: REMINDER_GONE };
  if (result.kind === "api" && result.code === "past_due") return { kind: "failed", message: SNOOZE_PAST_DUE };
  if (result.kind === "api" && result.code === "closed") return { kind: "failed", message: REMINDER_DONE };
  return { kind: "failed", message: failureMessage(result) };
}

export async function markPaid(id: string): Promise<UpdateResult<Reminder>> {
  const result = await apiRequest("post", "/reminders/{id}/acted", { pathParams: { id } });
  return result.ok ? { kind: "ok", data: result.data } : failure(result);
}

export async function snooze(id: string, choice: SnoozeChoice): Promise<UpdateResult<Reminder>> {
  const result = await apiRequest("post", "/reminders/{id}/snooze", { pathParams: { id }, body: { choice } });
  return result.ok ? { kind: "ok", data: result.data } : failure(result);
}

export async function dismiss(id: string): Promise<UpdateResult<Reminder>> {
  const result = await apiRequest("post", "/reminders/{id}/dismiss", { pathParams: { id } });
  return result.ok ? { kind: "ok", data: result.data } : failure(result);
}

export async function markAllRead(): Promise<UpdateResult<number>> {
  const result = await apiRequest("post", "/reminders/read");
  return result.ok ? { kind: "ok", data: result.data.marked } : failure(result);
}
