import { apiError } from "@/lib/api/errors";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(): Promise<Response> {
  const supabase = await createStudentClient();
  const { error } = await supabase.auth.signOut();
  if (error) return apiError(502, "sign_out_failed", "We could not sign you out. Please try again.");

  return Response.json({ status: "signed_out" }, { headers: { "Cache-Control": "no-store" } });
}
