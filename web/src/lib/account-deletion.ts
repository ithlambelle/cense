import "server-only";

// Delete my account (S28): the student's PostHog person, then the sign-in
// record, which cascades to every table that holds their data.

// S28 and S55 (Ben, 2026-10-25): the PostHog person goes with its events and
// session recordings, because with 10 to 50 students a timestamped trail
// under the old id could still point to one person. Set to false to delete
// only the person profile and keep its events and recordings, unlinked.
export const DELETE_ANALYTICS_HISTORY = true;

// PostHog's private API (US region), not the ingestion host the app sends to.
const POSTHOG_API_HOST = "https://us.posthog.com";
const POSTHOG_TIMEOUT_MS = 10_000;

export type PostHogAdmin = { apiKey: string; projectId: string };

export type DeletionConfig =
  | { ok: true; serviceRoleKey: string; posthog: PostHogAdmin | null }
  | { ok: false; missing: string[] };

// Checked before anything is deleted, so a missing setting deletes nothing.
// PostHog holds data only where analytics runs (its project token is set,
// Vercel Production), and only there are its keys needed.
export function accountDeletionConfig(env: Record<string, string | undefined> = process.env): DeletionConfig {
  const missing: string[] = [];
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  let posthog: PostHogAdmin | null = null;
  if (env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    const apiKey = env.POSTHOG_PERSONAL_API_KEY;
    const projectId = env.POSTHOG_PROJECT_ID;
    if (!apiKey) missing.push("POSTHOG_PERSONAL_API_KEY");
    if (!projectId) missing.push("POSTHOG_PROJECT_ID");
    if (apiKey && projectId) posthog = { apiKey, projectId };
  }
  if (missing.length > 0 || !serviceRoleKey) return { ok: false, missing };
  return { ok: true, serviceRoleKey, posthog };
}

// Deletes the PostHog person known by the student's id (S36: the same id as
// the database), queueing its events and recordings for deletion with it.
// True when PostHog accepted it, including when it had no such person (the
// student never had analytics on). PostHog deletes events in a weekly batch,
// within the 30 days the privacy policy promises.
// https://posthog.com/docs/privacy/data-deletion
export async function deletePostHogPerson(studentId: string, posthog: PostHogAdmin, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchFn(`${POSTHOG_API_HOST}/api/projects/${encodeURIComponent(posthog.projectId)}/persons/bulk_delete/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${posthog.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        distinct_ids: [studentId],
        delete_events: DELETE_ANALYTICS_HISTORY,
        delete_recordings: DELETE_ANALYTICS_HISTORY,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(POSTHOG_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const summary = (await response.json().catch(() => null)) as { deletion_errors?: unknown } | null;
    return !(Array.isArray(summary?.deletion_errors) && summary.deletion_errors.length > 0);
  } catch {
    return false;
  }
}
