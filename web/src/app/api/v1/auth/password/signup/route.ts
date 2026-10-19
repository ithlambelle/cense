import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl, passwordCredentialsSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const parsed = passwordCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    if (typeof body === "object" && body !== null && "password" in body &&
        typeof body.password === "string" && new TextEncoder().encode(body.password).length > 72) {
      return apiError(400, "invalid_password", "Use a password of 72 bytes or fewer.");
    }
    return validationError(parsed.error);
  }

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: authCallbackUrl(new URL(request.url).origin, "/sign-in?confirmed=1") },
  });
  if (error) {
    // With a confirm setting off, Supabase reports an existing account as an error.
    if (error.code === "user_already_exists") return accountExists();
    console.error("Password signup failed", { code: error.code, status: error.status });
    if (error.status === 429) return apiError(429, "rate_limited", "Please wait before trying again.");
    return apiError(502, "sign_up_failed", "We could not create your account. Please try again.");
  }

  // With Confirm email on (the hosted setup), Supabase answers an existing
  // confirmed account with a placeholder user that has no identities and sends
  // no email. Telling the student is our choice (Ben, 2026-10-19), so they are
  // not left waiting for a code. Checked defensively: the shape is not a
  // documented contract, and anything else keeps the normal answer.
  // https://supabase.com/docs/reference/javascript/auth-signup
  if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) return accountExists();

  return Response.json(
    { status: data.session ? "signed_in" : "check_email" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function accountExists(): Response {
  return apiError(409, "account_exists", "An account already uses this email.");
}
