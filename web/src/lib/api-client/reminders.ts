import type { components } from "../../../../api/openapi";
import { apiRequest, failureMessage, isUnauthorized, type ApiFailure } from "./client";

// The reapply reminder after a denial (GET and POST /reminders).

export type Reminder = components["schemas"]["Reminder"];

type Failed = { kind: "signed-out" } | { kind: "failed"; message: string };
export type ReminderSave = { kind: "ok"; reminder: Reminder } | Failed;
export type RemindersLoad = { kind: "ok"; reminders: Reminder[] } | Failed;

export const REMINDER_NOT_FOUND = "We couldn’t find this card. Open it from Home.";
export const REMINDER_ALREADY_SENT = "This reminder was already sent, so it can’t be changed.";

function failure(result: ApiFailure): Failed {
  if (isUnauthorized(result)) return { kind: "signed-out" };
  if (result.kind === "api" && result.status === 404) return { kind: "failed", message: REMINDER_NOT_FOUND };
  if (result.kind === "api" && result.code === "already_sent") return { kind: "failed", message: REMINDER_ALREADY_SENT };
  // invalid_reminder and a passing outage (503) carry the API's own message;
  // offline gets the "check your connection" line. Saving again is the retry.
  return { kind: "failed", message: failureMessage(result) };
}

// Sets the reapply reminder for a denied card. Picking again replaces an unsent one.
export async function saveReapplyReminder(applicationId: string, remindOn: string): Promise<ReminderSave> {
  const result = await apiRequest("post", "/reminders", { body: { applicationId, remindOn } });
  return result.ok ? { kind: "ok", reminder: result.data } : failure(result);
}

export async function loadReminders(): Promise<RemindersLoad> {
  const result = await apiRequest("get", "/reminders");
  return result.ok ? { kind: "ok", reminders: result.data.reminders } : failure(result);
}

// This card's reapply reminder: the unsent one if there is one, else the newest.
export function reapplyReminderFor(reminders: Reminder[], applicationId: string): Reminder | null {
  const mine = reminders
    .filter((r) => r.kind === "reapply" && r.applicationId === applicationId)
    .sort((a, b) => Number(a.sentAt !== null) - Number(b.sentAt !== null) || b.createdAt.localeCompare(a.createdAt));
  return mine[0] ?? null;
}
