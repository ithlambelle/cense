// Created with Claude Code (2026-11-17). The daily limits on typed Penny
// questions and confirmation emails, claimed by the server for the signed-in
// student (20261117110000_security_quotas.sql).
import "server-only";

import type { Student } from "@/lib/api/auth";
import { createServiceClient, type ServiceClient } from "@/lib/supabase/service";

export type QuotaClaim = "claim_penny_ask" | "claim_confirmation_email";

export type QuotaResult =
  | { ok: true; data: unknown }
  // not_configured: SUPABASE_SERVICE_ROLE_KEY is missing, so nothing was
  // claimed or counted.
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "database"; code?: string };

// PostgREST's answer when no function has that name and those arguments.
const NO_SUCH_FUNCTION = "PGRST202";

// Only the service role may claim, so a student cannot call the claim
// directly and use up the shared allowance for everyone. The student's id
// comes from the verified session (authenticatedStudent), never from the
// request.
export async function claimQuota(
  name: QuotaClaim,
  student: Student,
  serviceRoleKey: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
): Promise<QuotaResult> {
  if (!serviceRoleKey) return { ok: false, reason: "not_configured" };

  const service = createServiceClient(serviceRoleKey);
  let { data, error } = await service.rpc(name, { p_student_id: student.studentId });

  // TODO: remove this fallback after 20261117110000_security_quotas.sql is
  // applied to production. Until then only the old claim (no arguments,
  // called as the student) exists; this lets the code deploy before the
  // migration. Once the migration is applied the old claim is gone and this
  // branch is never taken.
  if (error?.code === NO_SUCH_FUNCTION) {
    console.error(JSON.stringify({ event: "quota_claim_legacy", claim: name }));
    ({ data, error } = await student.supabase.rpc(name));
  }

  if (error) return { ok: false, reason: "database", code: error.code };
  return { ok: true, data };
}

// The daily purge (run by the reminders cron with the service role): deletes
// quota rows older than two days, so a deleted student's id is gone within
// two days even when nobody claims. Never throws; a failure logs only the
// database's code and is tried again tomorrow.
export async function purgeOldQuotaRows(service: ServiceClient): Promise<{ ok: true; deleted: number } | { ok: false; code: string | null }> {
  try {
    const { data, error } = await service.rpc("purge_old_quota_rows");
    if (error) {
      console.error(JSON.stringify({ event: "quota_purge_failed", code: error.code ?? null }));
      return { ok: false, code: error.code ?? null };
    }
    return { ok: true, deleted: typeof data === "number" ? data : 0 };
  } catch {
    console.error(JSON.stringify({ event: "quota_purge_failed", code: null }));
    return { ok: false, code: null };
  }
}
