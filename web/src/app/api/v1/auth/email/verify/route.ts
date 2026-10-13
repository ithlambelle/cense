import { z } from "zod";

import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createStudentClient } from "@/lib/supabase/server";

const requestSchema = z.strictObject({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });

  if (error) {
    return apiError(401, "invalid_code", "The code is wrong or expired. Request a new one.");
  }

  return Response.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } });
}
