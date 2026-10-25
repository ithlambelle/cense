import { z } from "zod";

import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl } from "@/lib/api/password";
import { ROUTES } from "@/lib/routes";
import { createStudentClient } from "@/lib/supabase/server";

const requestSchema = z.strictObject({ email: z.email().max(254) });

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: authCallbackUrl(new URL(request.url).origin, ROUTES.start) },
  });
  if (error) {
    return apiError(502, "email_code_failed", "We could not send a code. Please try again.");
  }

  return Response.json({ status: "code_sent" }, { headers: { "Cache-Control": "no-store" } });
}
