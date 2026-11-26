import { z } from "zod";

import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl } from "@/lib/api/password";
import { emailLinkOrigin, logMissingAppBaseUrl } from "@/lib/auth/email-links";
import { authThrottle, codeSent } from "@/lib/auth/throttle";
import { ROUTES } from "@/lib/routes";
import { createStudentClient } from "@/lib/supabase/server";

const requestSchema = z.strictObject({ email: z.email().max(254) });

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const limited = await authThrottle(request, "send", parsed.data.email);
  if (limited) return limited;

  // The email carries a code, not a link, but any link Supabase adds must
  // point at the app's own address. Without one, Supabase's Site URL.
  const origin = emailLinkOrigin(request.url);
  if (!origin) logMissingAppBaseUrl("auth/email");
  const supabase = await createStudentClient();
  const sendStarted = Date.now();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: origin ? { emailRedirectTo: authCallbackUrl(origin, ROUTES.start) } : undefined,
  });
  if (error) {
    return apiError(502, "email_code_failed", "We could not send a code. Please try again.");
  }
  // A new code: the email's 5 tries start again.
  await codeSent(parsed.data.email, Date.now() - sendStarted);

  return Response.json({ status: "code_sent" }, { headers: { "Cache-Control": "no-store" } });
}
