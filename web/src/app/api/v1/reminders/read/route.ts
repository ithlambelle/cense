import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";

// "Mark all read" in Updates (Flow B N1): every sent reminder of the
// student's not read since it last came up. Answers how many it marked.
export async function POST(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase.rpc("mark_reminders_read");
  if (error) return databaseError("reminders_read_all", error);
  return Response.json({ marked: Number(data ?? 0) }, { headers: { "Cache-Control": "no-store" } });
}
