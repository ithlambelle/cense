import { apiRequest, failureMessage, isUnauthorized, type ApiFailure } from "./client";
import { savePlanStep } from "./plans";

// Saving the payment reminder screen (US-08, Figma 144:1822): the card's two
// days, the student's reminder choices, then the "Set a payment reminder"
// star on Home. Three requests, in that order, each only after the one before
// it worked, so the star never lights for reminders that were not saved.

export type CardDays = { statementClosingDay: number; paymentDueDay: number };

// The two toggles the frame draws. Reminder settings belong to the student,
// not the card (GET and PATCH /me/reminder-settings), so they apply to every
// approved card they track. Check autopay is not on this screen and is never sent.
export type ReminderChoices = { paymentDue: boolean; statementClosing: boolean };

// Which request failed. Everything before it was saved.
export type SetupStage = "days" | "choices" | "star";

export type ReminderSetupSave =
  | { kind: "ok" }
  | { kind: "signed-out" }
  | { kind: "failed"; stage: SetupStage; message: string };

// A day of the month typed by the student: a whole number from 1 to 31, or null.
export function parseDay(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const day = Number(trimmed);
  return day >= 1 && day <= 31 ? day : null;
}

// Says what was saved before the failure, then the reason, so a student never
// has to guess whether their dates are in.
const SAVED_BEFORE: Record<SetupStage, string> = {
  days: "",
  choices: "Your dates are saved, but your reminder choices are not. ",
  star: "Your reminders are saved, but Home did not mark this step done. ",
};

function failed(stage: SetupStage, failure: ApiFailure): ReminderSetupSave {
  if (isUnauthorized(failure)) return { kind: "signed-out" };
  return { kind: "failed", stage, message: `${SAVED_BEFORE[stage]}${failureMessage(failure)}` };
}

export async function saveReminderSetup({
  applicationId,
  days,
  choices,
  savedChoices,
}: {
  applicationId: string;
  days: CardDays;
  choices: ReminderChoices;
  // The choices as last saved. Only the ones that differ are sent.
  savedChoices: ReminderChoices;
}): Promise<ReminderSetupSave> {
  // Saving the days makes the database schedule this card's reminders.
  const daysResult = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: days,
  });
  if (!daysResult.ok) return failed("days", daysResult);

  const changed: Partial<ReminderChoices> = {};
  if (choices.paymentDue !== savedChoices.paymentDue) changed.paymentDue = choices.paymentDue;
  if (choices.statementClosing !== savedChoices.statementClosing) changed.statementClosing = choices.statementClosing;
  if (Object.keys(changed).length > 0) {
    const choicesResult = await apiRequest("patch", "/me/reminder-settings", { body: changed });
    if (!choicesResult.ok) return failed("choices", choicesResult);
  }

  const star = await savePlanStep(applicationId, "first_month", "payment_reminder", true);
  if (star.kind === "signed-out") return star;
  if (star.kind === "failed") return { kind: "failed", stage: "star", message: `${SAVED_BEFORE.star}${star.message}` };
  return { kind: "ok" };
}
