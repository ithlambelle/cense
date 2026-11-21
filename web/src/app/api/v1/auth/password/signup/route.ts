import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl, passwordCredentialsSchema } from "@/lib/api/password";
import { emailLinkOrigin, logMissingAppBaseUrl } from "@/lib/auth/email-links";
import { authThrottle } from "@/lib/auth/throttle";
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

  // Every sign-up sends an email (a confirmation code, or a sign-in code for
  // an existing account), so it counts as a send.
  const limited = await authThrottle(request, "send", parsed.data.email);
  if (limited) return limited;

  const origin = emailLinkOrigin(request.url);
  if (!origin) logMissingAppBaseUrl("auth/password/signup");
  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: origin ? { emailRedirectTo: authCallbackUrl(origin, "/sign-in?confirmed=1") } : undefined,
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
