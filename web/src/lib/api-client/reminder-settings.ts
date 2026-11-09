import type { components } from "../../../../api/openapi";
import { apiRequest, failureMessage, isUnauthorized } from "./client";

// Reminder settings (Figma 222:2344): PATCH /me/reminder-settings. They are
// the student's, not a card's, so they cover every card they track.

export type ReminderSettings = components["schemas"]["ReminderSettings"];

export type ReminderSettingsSave =
  | { kind: "ok"; settings: ReminderSettings }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string };

// One change at a time: emails on or off, or one kind. Answers with every
// setting as saved.
export async function saveReminderSetting(change: Partial<ReminderSettings>): Promise<ReminderSettingsSave> {
  const result = await apiRequest("patch", "/me/reminder-settings", { body: change });
  if (result.ok) return { kind: "ok", settings: result.data };
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}
