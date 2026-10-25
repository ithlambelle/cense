"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthLayout, BackLinkTo } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { FALLBACK_MESSAGE } from "@/lib/api-client/client";
import { pendingRequest } from "@/lib/api-client/pending";
import { looksLikeEmail } from "@/lib/auth/password";
import { ROUTES } from "@/lib/routes";

// Forgot password? (Figma 397:1888, 213:1304). The answer is the same whether
// or not an account uses the email, so the screen never reveals who has one.
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const sentRef = useRef<HTMLParagraphElement>(null);

  // The form is replaced by the message, so focus moves to it (WCAG 2.4.3).
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!looksLikeEmail(email)) {
      setError("That email doesn’t look quite right.");
      return;
    }
    setError(null);
    setFormError(null);
    setPending(true);
    const result = await pendingRequest("POST /auth/password/reset", { email: email.trim() });
    setPending(false);
    if (result.kind === "ok") {
      setSent(true);
      return;
    }
    setFormError(
      result.kind === "unavailable"
        ? "Password reset isn’t available yet. You can sign in with Google or an email code."
        : result.kind === "failed"
          ? result.message
          : FALLBACK_MESSAGE,
    );
  }

  return (
    <AuthLayout title="Forgot password?" back={<BackLinkTo href={ROUTES.signIn} label="Back to log in" />}>
      {sent ? (
        <p ref={sentRef} tabIndex={-1} role="status" className="text-body-m text-indigo-black outline-none">
          If an account uses {email.trim()}, we sent it a link to set a new password. The link opens this app.
        </p>
      ) : (
        <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={error ?? undefined}
            disabled={pending}
          />
          <Button type="submit" chevron={false} pending={pending}>
            Send link
          </Button>
        </form>
      )}
      {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}
      <Link
        href={ROUTES.signIn}
        className="min-h-11 content-center self-center text-body-s text-violet underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
      >
        Back to log in
      </Link>
    </AuthLayout>
  );
}
