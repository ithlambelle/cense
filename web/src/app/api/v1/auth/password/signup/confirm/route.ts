import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { confirmedByThisCode } from "@/lib/api/confirmation";
import { passwordSignUpConfirmSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

// Confirms a password sign-up with the emailed code. When this code is what
// confirms the account, it then sets the password the student chose and ends
// any other session: Supabase keeps the password from the first sign-up on an
// account that was never confirmed and ignores a later one, so without this the
// account would keep whichever password came first, possibly one chosen by
// someone who does not own the inbox.
//
// An account confirmed earlier keeps its password and its other sessions. A
// sign-up form never changes a confirmed account's password; only Forgot
// password does. The code still proves the inbox, so the student is signed in.
export async function POST(request: Request): Promise<Response> {
  const parsed = passwordSignUpConfirmSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { email, code, password } = parsed.data;

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return apiError(401, "invalid_code", "The code is wrong or expired. Request a new one.");

  if (!confirmedByThisCode(data.user)) return signedIn(false);

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

  return signedIn(true);
}

// `passwordChanged: false` tells the screen the account already existed and
// kept its password. Only the inbox owner gets this far.
function signedIn(passwordChanged: boolean): Response {
  return Response.json({ status: "signed_in", passwordChanged }, { headers: { "Cache-Control": "no-store" } });
}
