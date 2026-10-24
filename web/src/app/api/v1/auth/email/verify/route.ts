import { z } from "zod";

import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { confirmedByThisCode, unusablePassword } from "@/lib/api/confirmation";
import { createStudentClient } from "@/lib/supabase/server";

const requestSchema = z.strictObject({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });

  if (error) {
    return apiError(401, "invalid_code", "The code is wrong or expired. Request a new one.");
  }

  // A password set before the inbox was proven may not be the student's: anyone
  // can sign up with someone else's email. When this code is what confirms the
  // account, that password is replaced with one nobody knows and any other
  // session is ended. Accounts confirmed earlier keep their password.
  if (confirmedByThisCode(data.user)) {
    const { error: updateError } = await supabase.auth.updateUser({ password: unusablePassword() });
    if (updateError) {
      console.error("Replacing the unconfirmed password failed", { code: updateError.code, status: updateError.status });
      // Fails closed: no session on an account that may carry someone else's password.
      await supabase.auth.signOut({ scope: "local" });
      return apiError(502, "password_update_failed", "We could not finish signing you in. Please try again.");
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) console.error("Ending other sessions failed", { code: signOutError.code, status: signOutError.status });
  }

  return Response.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } });
}
