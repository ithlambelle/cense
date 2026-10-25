import type { components } from "../../../../api/openapi";
import { apiRequest, failureMessage, isUnauthorized } from "./client";

// The reason a card was denied, read and saved on the application
// (GET and PATCH /applications/{id}).

export type DenialReason = NonNullable<components["schemas"]["ApplicationDetail"]["denialReason"]>;
export type SavedDenialReason = { reason: DenialReason; note: string | null };

// The "What did the letter say?" box allows this many characters (the API's limit).
export const DENIAL_NOTE_MAX = 200;

export type DenialReasonSave = { kind: "ok" } | { kind: "signed-out" } | { kind: "failed"; message: string };

// Saves the reason, and the note for "Something else" (trimmed; empty saves none).
// Any other reason clears a note saved before.
export async function saveDenialReason(applicationId: string, reason: DenialReason, note = ""): Promise<DenialReasonSave> {
  const trimmed = note.trim().slice(0, DENIAL_NOTE_MAX);
  const result = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: { denialReason: reason, denialReasonNote: reason === "something_else" && trimmed ? trimmed : null },
  });
  if (result.ok) return { kind: "ok" };
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}

// The saved reason, or null when none is saved or it cannot be read. Only
// the plan's small reason note uses this, so a failed read just hides it.
export async function loadDenialReason(applicationId: string): Promise<SavedDenialReason | null> {
  const result = await apiRequest("get", "/applications/{id}", { pathParams: { id: applicationId } });
  if (!result.ok || !result.data.denialReason) return null;
  return { reason: result.data.denialReason, note: result.data.denialReasonNote };
}
