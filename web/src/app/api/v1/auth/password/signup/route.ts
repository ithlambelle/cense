import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl, passwordCredentialsSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordCredentialsSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: authCallbackUrl(new URL(request.url).origin, "/sign-in?confirmed=1") },
  });
  if (error) return apiError(502, "sign_up_failed", "We could not create your account. Please try again.");

  return Response.json(
    { status: data.session ? "signed_in" : "check_email" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
