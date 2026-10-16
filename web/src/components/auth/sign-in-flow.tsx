"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { BackLink } from "@/components/ui/back-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { CODE_LENGTH, CodeInput } from "@/components/ui/code-input";
import { GlowCard } from "@/components/ui/glow-card";
import { ScreenShell } from "@/components/ui/screen-shell";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { googleSignInPath, ROUTES } from "@/lib/routes";

function sendLabel(cooldown: number): string {
  return cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send email code";
}

// Seconds before "Send a new code" can be pressed again. The server has no
// rate limit yet, so the screen must not make repeat sends easy.
const RESEND_COOLDOWN_SECONDS = 30;

type SignInFlowProps = {
  // Where to go after signing in. Already checked against the allow-list.
  next: string | null;
  // A message for a Google sign-in that was cancelled or failed.
  initialError: string | null;
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

// Two screens at most: choose Google or an email, then enter the code.
// The email address and the code live in this component's memory only.
export function SignInFlow({ next, initialError }: SignInFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCooldown();

  async function sendCode(): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("post", "/auth/email", { body: { email: email.trim() } });
    setPending(false);
    if (!result.ok) {
      // With no answer, the code may still have been sent, so the wait starts.
      if (result.kind === "network") startCooldown();
      setError(result.kind === "api" && result.code === "invalid_request"
        ? "That email doesn’t look quite right."
        : failureMessage(result));
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
      <ScreenShell>
        <BackLink
          disabled={pending}
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
            setNotice(null);
          }}
        />
        <h1 className="mt-3 font-heading text-title font-bold">Check your email</h1>
        <p className="mt-2 text-label text-muted-foreground">Sent to {email.trim()}</p>
        <GlowCard purpose="form" className="mt-4">
          <form method="post" onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
            <CodeInput value={code} onChange={setCode} error={error ?? undefined} disabled={pending} />
            <Button type="submit" disabled={code.length !== CODE_LENGTH} pending={pending}>
              Verify
            </Button>
          </form>
        </GlowCard>
        <Button variant="link" className="mt-2 self-center" disabled={cooldown > 0 || pending} onClick={resend}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
        <p aria-live="polite" className="text-center text-label text-muted-foreground">
          {notice}
        </p>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <BackLink href={ROUTES.cards} />
      <h1 className="mt-3 font-heading text-title font-bold">Let’s get started</h1>
      <p className="mt-2 text-label text-muted-foreground">
        Sign in to save your answers and your card match.
      </p>
      {initialError ? (
        <p role="alert" className="mt-4 text-label text-destructive">
          {initialError}
        </p>
      ) : null}
      {/* A plain link: the browser must leave the page to reach Google. */}
      <a href={googleSignInPath(next)} className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
        {/* Google's own "G" mark, unaltered, as its sign-in branding asks. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a 20px static SVG; next/image adds nothing here */}
        <img src="/google-g.svg" alt="" width={20} height={20} />
        Continue with Google
      </a>
      <p className="my-3 text-center text-label text-muted-foreground">or</p>
      <GlowCard purpose="form">
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
            {sendLabel(cooldown)}
          </Button>
        </form>
      </GlowCard>
      <p className="mt-6 text-center text-legal text-muted-foreground">
        Cense saves your email, your quiz answers and your card match. We never ask for your Social Security number
        or date of birth.
      </p>
    </ScreenShell>
  );
}
