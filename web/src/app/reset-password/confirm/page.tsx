import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConfirmResetLink, LINK_EXPIRED_PATH } from "@/components/auth/confirm-reset-link";
import { firstParam } from "@/lib/search-params";

// Created with Claude Code (2026-11-17). The password reset email's link
// (supabase/templates/recovery.html adds ?token_hash=). Nothing is verified
// here; the Continue button does that (components/auth/confirm-reset-link.tsx).
export const metadata: Metadata = { title: "Reset your password | CENSE", robots: { index: false } };

export default async function ConfirmResetLinkPage({ searchParams }: PageProps<"/reset-password/confirm">) {
  const params = await searchParams;
  const tokenHash = firstParam(params.token_hash);
  const code = firstParam(params.code);
  if (tokenHash) return <ConfirmResetLink link={{ tokenHash }} />;
  if (code) return <ConfirmResetLink link={{ code }} />;
  redirect(LINK_EXPIRED_PATH);
}
