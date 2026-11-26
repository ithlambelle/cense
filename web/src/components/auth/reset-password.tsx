"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthLayout, BackLinkHome } from "@/components/auth/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { PasswordField } from "@/components/ui/password-field";
import { SENSITIVE } from "@/lib/analytics";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { PASSWORD_MIN, passwordFeedback, passwordProblem } from "@/lib/auth/password";
import { ROUTES } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

// Set a new password (S4). Reached from the reset email's confirm screen
// (/reset-password/confirm), whose Continue signs the student in with the
// link's session. No frame: built from the sign-up form's parts and proposed
// to design. `email` is the signed-in account's, shown so that a student sent
// someone else's link notices it is not their account (null when signed out).
export function ResetPassword({ email = null }: { email?: string | null }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ repeat?: string; form?: string }>({});
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  // True once Save password has been tapped: the rule then shows as an error,
  // always for the password as it is now.
  const [submitted, setSubmitted] = useState(false);
  const rule = passwordFeedback(password, submitted);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setSubmitted(true);
    if (passwordProblem(password)) return setErrors({});
    if (repeat !== password) return setErrors({ repeat: "Let’s make those passwords match." });
    setErrors({});
    setPending(true);
    const result = await apiRequest("post", "/auth/password/reset/confirm", { body: { password } });
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (result.ok) {
      router.replace(ROUTES.start);
      router.refresh();
      return;
    }
    setPending(false);
    // No reset session in this browser (401 sign_in_required), or one that is
    // not from a reset link opened in the last 10 minutes (403 recovery_required).
    // Either way the way on is a new link.
    if (result.kind === "api" && (result.status === 401 || result.code === "recovery_required")) return setExpired(true);
    setErrors({ form: failureMessage(result) });
  }

  if (expired) {
    return (
      <AuthLayout title="This link has expired" back={<BackLinkHome />}>
        <p className="text-body-m text-indigo-black">Reset links work once and for a short time. Ask for a new one.</p>
        <Link href={ROUTES.forgotPassword} className={buttonVariants({ chevron: false })}>
          Send a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" back={<BackLinkHome />}>
      {email ? (
        // The email is the student's own: masked in session replay.
        <p className={cn("text-body-m text-indigo-black", SENSITIVE)}>For the account {email}</p>
      ) : null}
      <form method="post" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN} characters`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={rule.hint}
          error={rule.error}
          disabled={pending}
        />
        <PasswordField
          label="Repeat password"
          name="repeat-password"
          autoComplete="new-password"
          placeholder="Your password again"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={errors.repeat}
          disabled={pending}
        />
        <Button type="submit" chevron={false} className="mt-1" pending={pending}>
          Save password
        </Button>
      </form>
      {errors.form ? <ErrorMessage>{errors.form}</ErrorMessage> : null}
    </AuthLayout>
  );
}
