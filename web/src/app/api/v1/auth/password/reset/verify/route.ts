import { NextRequest } from "next/server";

import { createStudentClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<Response> {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  if (!tokenHash && !code) {
    return Response.redirect(new URL("/forgot-password?error=invalid_link", request.url), 303);
  }

  const supabase = await createStudentClient();
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    : await supabase.auth.exchangeCodeForSession(code!);

  return Response.redirect(
    new URL(error ? "/forgot-password?error=invalid_link" : "/reset-password", request.url),
    303,
  );
}
