"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { forgetTabState } from "@/components/account/log-out-button";
import { AuthLayout, BackLinkHome } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { resetAnalytics } from "@/lib/analytics";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// Created with Claude Code (2026-11-17).
//
// Where the password reset email's link lands. Opening the link signs no one
// in: only Continue does (external audit of a8fe7d4, login CSRF). Otherwise
// someone could ask for a reset of their own account, send the student the
// link, and one click would swap the student into that account; and a mail
// scanner that opens links would use the link up. No frame: built from the
// auth screens' parts.
export type ResetLink = { tokenHash: string } | { code: string };

export const LINK_EXPIRED_PATH = `${ROUTES.forgotPassword}?error=invalid_link`;

export function ConfirmResetLink({ link }: { link: ResetLink }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherAccount, setOtherAccount] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await apiRequest("post", "/auth/password/reset/verify", { body: link });
    if (!isMounted()) return;
    if (result.ok) {
      // Stays pending while Set a new password loads. Replace, so Back never
      // returns to a link that is already used.
      router.replace(ROUTES.resetPassword);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "api" && result.code === "invalid_link") return router.replace(LINK_EXPIRED_PATH);
    if (result.kind === "api" && result.code === "signed_in_as_other") return setOtherAccount(true);
    setError(failureMessage(result));
  }

  async function logOut() {
    setPending(true);
    setError(null);
    const result = await apiRequest("post", "/auth/logout");
    if (!isMounted()) return;
    if (!result.ok) {
      setPending(false);
      setError(failureMessage(result));
      return;
    }
    forgetTabState();
    resetAnalytics();
    // This link was used up checking it, so the way on is a new one.
    router.replace(ROUTES.forgotPassword);
    router.refresh();
  }

  if (otherAccount) {
    return (
      <AuthLayout key="other" title="Log out first" focusTitle back={<BackLinkHome />}>
        <p className="text-body-m text-indigo-black">
          You’re logged in to a different account. Log out, then ask for a new reset link.
        </p>
        <Button chevron={false} pending={pending} onClick={logOut}>
          Log out
        </Button>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" back={<BackLinkHome />}>
      <p className="text-body-m text-indigo-black">Continue to choose a new password for your Cense account.</p>
      <Button chevron={false} pending={pending} onClick={confirm}>
        Continue
      </Button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </AuthLayout>
  );
}
