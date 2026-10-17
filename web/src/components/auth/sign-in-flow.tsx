"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthLayout, BackButton, BackLinkHome } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { CODE_LENGTH, CodeInput } from "@/components/ui/code-input";
import { ErrorMessage } from "@/components/ui/error-message";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { pendingRequest } from "@/lib/api-client/pending";
import { looksLikeEmail, passwordProblem } from "@/lib/auth/password";
import { googleSignInPath, ROUTES, signInPath, signUpPath } from "@/lib/routes";

// Seconds before a new code can be sent. Supabase allows one code request per
// 60 seconds by default (https://supabase.com/docs/guides/auth/auth-email-passwordless),
// so a shorter wait here would only produce errors.
const RESEND_COOLDOWN_SECONDS = 60;

export type AuthMode = "sign-in" | "sign-up";

type SignInFlowProps = {
  mode: AuthMode;
  // Where to go after signing in. Already checked against the allow-list.
  next: string | null;
  // A message for a Google sign-in that was cancelled or failed.
  initialError: string | null;
};

const COPY: Record<AuthMode, { title: string; switchText: string; switchLink: string }> = {
  "sign-up": { title: "Let’s get started", switchText: "Already have an account?", switchLink: "Log in" },
  "sign-in": { title: "Welcome back", switchText: "Don’t have an account?", switchLink: "Sign up" },
};

function useCooldown(): [number, () => void] {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);
  return [secondsLeft, () => setSecondsLeft(RESEND_COOLDOWN_SECONDS)];
}

// Sign in and sign up, from the auth frames (405:509, 397:1908, 397:1867) in
// Ben's order (2026-10-16): Google first, then an email code. Both modes use
// the same email code, which creates the account on first use; they differ
// only in wording. The email and code live in this component's memory only and
// never in the address bar.
export function SignInFlow({ mode, next, initialError }: SignInFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password" | "confirm-email">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCooldown();
  const copy = COPY[mode];

  async function sendCode(): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("post", "/auth/email", { body: { email: email.trim() } });
    setPending(false);
    if (!result.ok) {
      // With no answer, the code may still have been sent, so the wait starts.
      if (result.kind === "network") startCooldown();
      setError(
        result.kind === "api" && result.code === "invalid_request"
          ? "That email doesn’t look quite right."
          : failureMessage(result),
      );
      return false;
    }
    startCooldown();
    return true;
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (await sendCode()) setStep("code");
  }

  async function resend() {
    if (await sendCode()) {
      setCode("");
      setNotice("We sent a new code.");
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("post", "/auth/email/verify", { body: { email: email.trim(), code } });
    if (!result.ok) {
      setPending(false);
      setError(failureMessage(result));
      return;
    }
    // Stays pending while the next screen loads.
    router.replace(next ?? ROUTES.start);
    router.refresh();
  }

  if (step === "password") {
    return (
      <PasswordStep
        mode={mode}
        title={copy.title}
        initialEmail={email}
        onDone={() => {
          router.replace(next ?? ROUTES.start);
          router.refresh();
        }}
        onConfirmEmail={(address) => {
          setEmail(address);
          setStep("confirm-email");
        }}
        onUseCode={() => setStep("email")}
      />
    );
  }

  if (step === "confirm-email") {
    return (
      <AuthLayout title="Check your email" back={<BackButton disabled={false} onClick={() => setStep("password")} />}>
        <p className="text-body-m text-indigo-black">
          We sent a link to {email.trim()}. Open it to confirm your account, then log in.
        </p>
        <Link href={signInPath(next)} className={buttonVariants()}>
          Go to log in
        </Link>
      </AuthLayout>
    );
  }

  if (step === "code") {
    return (
      <AuthLayout
        title="Check your email"
        back={
          <BackButton
            disabled={pending}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setNotice(null);
            }}
          />
        }
      >
        <p className="text-body-s text-indigo-black/70">We sent a 6-digit code to {email.trim()}.</p>
        <form method="post" onSubmit={submitCode} className="flex flex-col gap-4 py-5" noValidate>
          <CodeInput value={code} onChange={setCode} error={error ?? undefined} disabled={pending} />
          <Button type="submit" disabled={code.length !== CODE_LENGTH} pending={pending}>
            Verify
          </Button>
        </form>
        <Button variant="link" className="self-center text-violet" disabled={cooldown > 0 || pending} onClick={resend}>
          {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
        </Button>
        <p aria-live="polite" className="text-center text-body-s text-indigo-black/70">
          {notice}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={copy.title} back={<BackLinkHome />}>
      {initialError ? <ErrorMessage>{initialError}</ErrorMessage> : null}
      <GoogleButton href={googleSignInPath(next)} />
      <p className="text-center text-body-s text-navy">or</p>
      <form method="post" onSubmit={submitEmail} className="flex flex-col gap-4" noValidate>
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
        <Button type="submit" disabled={email.trim() === "" || cooldown > 0} pending={pending}>
          {cooldown > 0 ? `Email me a code in ${cooldown}s` : "Email me a code"}
        </Button>
      </form>
      <Button variant="link" className="self-center text-violet" onClick={() => setStep("password")}>
        Use a password instead
      </Button>
      <p className="flex min-h-11 items-center justify-center gap-1 text-body-s text-indigo-black">
        {copy.switchText}
        <Link
          href={mode === "sign-up" ? signInPath(next) : signUpPath(next)}
          className="text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copy.switchLink}
        </Link>
      </p>
      <p className="text-center text-body-s text-indigo-black/70">
        Cense saves your email, your quiz answers and your card match. We never ask for your Social Security number
        or date of birth.
      </p>
    </AuthLayout>
  );
}

type PasswordStepProps = {
  mode: AuthMode;
  title: string;
  initialEmail: string;
  onDone: () => void;
  onConfirmEmail: (email: string) => void;
  onUseCode: () => void;
};

// Password sign-up and log-in (the auth frames' password fields and error
// states), calling Mabelle's PR #24 routes. Until #24 is merged the routes do
// not exist, and the screen says so instead of failing silently.
function PasswordStep({ mode, title, initialEmail, onDone, onConfirmEmail, onUseCode }: PasswordStepProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; repeat?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!looksLikeEmail(email)) next.email = "That email doesn’t look quite right.";
    if (signUp) {
      const problem = passwordProblem(password);
      if (problem) next.password = problem;
      else if (repeat !== password) next.repeat = "Let’s make those passwords match.";
    } else if (password === "") {
      next.password = "Enter your password.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const body = { email: email.trim(), password };
    const result = signUp
      ? await pendingRequest("POST /auth/password/signup", body)
      : await pendingRequest("POST /auth/password/signin", body);
    if (result.kind === "ok") {
      if (result.data.status === "check_email") {
        setPending(false);
        onConfirmEmail(email);
        return;
      }
      onDone();
      return;
    }
    setPending(false);
    if (result.kind === "unavailable") {
      setErrors({ form: "Password sign-in isn’t available yet. Use Google or an email code." });
    } else if (result.kind === "failed" && result.code === "invalid_credentials") {
      setErrors({ password: "Not quite. Give your password another try." });
    } else {
      setErrors({ form: result.kind === "failed" ? result.message : "Something went wrong. Please try again." });
    }
  }

  return (
    <AuthLayout title={title} back={<BackButton disabled={pending} onClick={onUseCode} />}>
      <form method="post" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={pending}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={pending}
        />
        {signUp ? (
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
        ) : null}
        <Button type="submit" className="mt-1" pending={pending}>
          {signUp ? "Sign up" : "Log in"}
        </Button>
      </form>
      {signUp ? null : (
        <Link
          href="/forgot-password"
          className="min-h-11 content-center self-center text-body-s text-violet underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          Forgot password?
        </Link>
      )}
      {errors.form ? <ErrorMessage>{errors.form}</ErrorMessage> : null}
      <Button variant="link" className="self-center text-violet" disabled={pending} onClick={onUseCode}>
        Email me a code instead
      </Button>
    </AuthLayout>
  );
}
