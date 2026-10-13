import { NextRequest } from "next/server";

import { safeReturnPath } from "@/lib/api/redirect";
import { createStudentClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<Response> {
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return Response.redirect(new URL("/sign-in?error=cancelled", request.nextUrl.origin), 303);
  }

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return Response.redirect(new URL("/sign-in?error=callback", request.nextUrl.origin), 303);
  }

  return Response.redirect(new URL(next, request.nextUrl.origin), 303);
}
