"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthLayout, BackLinkHome } from "@/components/auth/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { PasswordField } from "@/components/ui/password-field";
import { pendingRequest } from "@/lib/api-client/pending";
import { passwordProblem } from "@/lib/auth/password";
import { ROUTES } from "@/lib/routes";

// Set a new password (S4). Reached from the reset email through the auth
// callback, which signs the student in with a recovery session (PR #24 docs).
// No frame: built from the sign-up form's parts and proposed to design.
export function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ password?: string; repeat?: string; form?: string }>({});
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = passwordProblem(password);
    if (problem) return setErrors({ password: problem });
    if (repeat !== password) return setErrors({ repeat: "Let’s make those passwords match." });
    setErrors({});
    setPending(true);
    const result = await pendingRequest("POST /auth/password/reset/confirm", { password });
    if (result.kind === "ok") {
      router.replace(ROUTES.start);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") return setExpired(true);
    setErrors({
      form:
        result.kind === "unavailable"
          ? "Setting a new password isn’t available yet."
          : result.kind === "failed"
            ? result.message
            : "Something went wrong. Please try again.",
    });
  }

  if (expired) {
    return (
      <AuthLayout title="This link has expired" back={<BackLinkHome />}>
        <p className="text-body-m text-indigo-black">Reset links work once and for a short time. Ask for a new one.</p>
        <Link href="/forgot-password" className={buttonVariants()}>
          Send a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" back={<BackLinkHome />}>
      <form method="post" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
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
        <Button type="submit" className="mt-1" pending={pending}>
          Save password
        </Button>
      </form>
      {errors.form ? <ErrorMessage>{errors.form}</ErrorMessage> : null}
    </AuthLayout>
  );
}
