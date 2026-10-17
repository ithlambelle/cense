"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { CODE_LENGTH, CodeInput } from "@/components/ui/code-input";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
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
  const [step, setStep] = useState<"email" | "code">("email");
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
      <p className="flex min-h-11 items-center justify-center gap-1 text-body-s text-indigo-black">
        {copy.switchText}
        <Link
          href={mode === "sign-up" ? signInPath(next) : signUpPath(next)}
          className="text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copy.switchLink}
        </Link>
      </p>
      <p className="text-center text-legal text-indigo-black/70">
        Cense saves your email, your quiz answers and your card match. We never ask for your Social Security number
        or date of birth.
      </p>
    </AuthLayout>
  );
}

const backControl =
  "flex h-12 w-[88px] items-center rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress";

function BackLinkHome() {
  return (
    <Link href={ROUTES.welcome} aria-label="Back" className={backControl}>
      <Image src="/icons/back-arrow.svg" alt="" width={33} height={33} />
    </Link>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Back" className={backControl}>
      <Image src="/icons/back-arrow.svg" alt="" width={33} height={33} />
    </button>
  );
}

// The page frame shared by the auth screens: back control, then a Sora title
// with the amber star beside it, as drawn.
function AuthLayout({ title, back, children }: { title: string; back: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col px-6 pt-8 pb-6">
        {back}
        <div className="flex flex-col gap-4 pt-3">
          <div className="flex items-center gap-1">
            <h1 className="font-heading text-h2 font-medium text-navy">{title}</h1>
            <Image src="/decor/star-large.svg" alt="" width={23} height={22} className="rotate-[17.75deg]" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
