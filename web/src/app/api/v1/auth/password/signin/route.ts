import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordSignInSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordSignInSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return apiError(401, "invalid_credentials", "The email or password is incorrect.");

  return Response.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } });
}
