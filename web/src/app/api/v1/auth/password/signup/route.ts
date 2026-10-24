import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl, passwordCredentialsSchema } from "@/lib/api/password";
import { createCookielessClient, createStudentClient } from "@/lib/supabase/server";

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

  // The email already has a confirmed account. Supabase sends no email then, so
  // a code to sign in is sent instead, and the answer is the same as for a new
  // account: this public form never says whether an email has an account.
  // Supabase reports it as the error `user_already_exists` when confirmation is
  // off, and as a placeholder user with no identities when it is on (hosted).
  // https://supabase.com/docs/reference/javascript/auth-signup
  const existing = error?.code === "user_already_exists" ||
    (!error && Array.isArray(data.user?.identities) && data.user.identities.length === 0);
  if (existing) {
    // Cookieless, so the response carries the same cookies as a new account's.
    const { error: otpError } = await createCookielessClient().auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: false },
    });
    // Only the code: the email must not reach the logs. A failed send keeps
    // the same answer, and the code screen offers Resend.
    if (otpError) console.error("Sign-in code for an existing account failed", { code: otpError.code, status: otpError.status });
    return checkEmail();
  }

  if (error) {
    console.error("Password signup failed", { code: error.code, status: error.status });
    if (error.status === 429) return apiError(429, "rate_limited", "Please wait before trying again.");
    return apiError(502, "sign_up_failed", "We could not create your account. Please try again.");
  }

  return data.session
    ? Response.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } })
    : checkEmail();
}

function checkEmail(): Response {
  return Response.json({ status: "check_email" }, { headers: { "Cache-Control": "no-store" } });
}
