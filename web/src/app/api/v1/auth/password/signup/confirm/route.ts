import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordSignUpConfirmSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

// Confirms a password sign-up with the emailed code, then sets the password the
// student chose. Supabase keeps the password from the first sign-up on an
// account that was never confirmed and ignores a later one, so without this the
// confirmed account would keep whichever password came first, possibly one
// chosen by someone who does not own the inbox. The code proves the inbox, so
// the password is set only after it, and any other session is ended.
export async function POST(request: Request): Promise<Response> {
  const parsed = passwordSignUpConfirmSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { email, code, password } = parsed.data;

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return apiError(401, "invalid_code", "The code is wrong or expired. Request a new one.");

  const { error: updateError } = await supabase.auth.updateUser({ password });
  // `same_password`: the account already has this password, which is the usual
  // case for a new sign-up.
  if (updateError && updateError.code !== "same_password") {
    console.error("Setting the sign-up password failed", { code: updateError.code, status: updateError.status });
    // Fails closed: no session unless the password is the student's own.
    await supabase.auth.signOut({ scope: "local" });
    return apiError(502, "password_update_failed", "We could not finish setting up your account. Please try again.");
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) console.error("Ending other sessions failed", { code: signOutError.code, status: signOutError.status });

  return Response.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } });
}
