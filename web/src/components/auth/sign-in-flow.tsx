"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthLayout, BackButton, BackLinkHome } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { CODE_LENGTH, CodeInput } from "@/components/ui/code-input";
import { ErrorMessage } from "@/components/ui/error-message";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, FALLBACK_MESSAGE, failureMessage } from "@/lib/api-client/client";
import { pendingRequest } from "@/lib/api-client/pending";
import { looksLikeEmail, passwordProblem } from "@/lib/auth/password";
import { googleSignInPath, ROUTES, signInPath, signUpPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// Seconds before a new code can be sent. Supabase allows one code request per
// 60 seconds by default (https://supabase.com/docs/guides/auth/auth-email-passwordless),
// so a shorter wait here would only produce errors.
const RESEND_COOLDOWN_SECONDS = 60;

type AuthMode = "sign-in" | "sign-up";

type SignInFlowProps = {
  mode: AuthMode;
  // Where to go after signing in. Already checked against the allow-list.
  next: string | null;
  // A message for a Google sign-in that was cancelled or failed.
  initialError: string | null;
};

const SWITCH_LINK =
  "text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
// Ben's order (2026-10-16): Google first, then an email code. The email code
// step is the same in both modes and creates the account on first use. The
// password step is not: sign-up asks for the password twice and calls the
// sign-up route; log-in calls the sign-in route and links to Forgot password.
// The email and code live in this component's memory only and never in the
// address bar.
export function SignInFlow({ mode: pageMode, next, initialError }: SignInFlowProps) {
  const router = useRouter();
  const isMounted = useIsMounted();
  // Starts as the page's mode. "Log in instead" (an email that already has an
  // account) switches it here, keeping the email, without changing the page.
  const [mode, setMode] = useState<AuthMode>(pageMode);
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  // True when the code confirms a password sign-up, not a code sign-in.
  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCooldown();
  // True once the student has left the first step, so later steps take focus.
  const [moved, setMoved] = useState(false);
  const copy = COPY[mode];

  function goTo(next: typeof step) {
    setMoved(true);
    setStep(next);
  }

  // `address` is passed when the email state may not have updated yet.
  async function sendCode(address: string = email): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("post", "/auth/email", { body: { email: address.trim() } });
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
    if (pending) return;
    // The button stays enabled (as drawn); an empty or unfinished email is explained instead.
    if (!looksLikeEmail(email)) {
      setError(email.trim() === "" ? "Enter your email." : "That email doesn’t look quite right.");
      return;
    }
    if (await sendCode()) goTo("code");
  }

  async function resend() {
    if (await sendCode()) {
      setCode("");
      setNotice("We sent a new code.");
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiRequest("post", "/auth/email/verify", { body: { email: email.trim(), code } });
    // The student left while it was checked: the answer must not move them again.
    if (!isMounted()) return;
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
          // Supabase emails a 6-digit code to confirm the new account (the same
          // template as code sign-in), and the code step verifies it, which
          // confirms the account and signs the student in. The email was just
          // sent, so the resend wait starts now.
          setEmail(address);
          setCode("");
          setConfirming(true);
          startCooldown();
          goTo("code");
        }}
        onUnconfirmed={async (address) => {
          // A password account that was never confirmed: a fresh code confirms
          // it and signs the student in. A failed send shows on the code step,
          // with Resend.
          setEmail(address);
          setCode("");
          setConfirming(true);
          await sendCode(address);
          if (!isMounted()) return;
          goTo("code");
        }}
        onUseCode={() => goTo("email")}
        onLogIn={(address) => {
          // The log-in screen offers Google, an email code and a password, so
          // it works however the existing account was made.
          setEmail(address.trim());
          setError(null);
          setMode("sign-in");
          goTo("email");
        }}
      />
    );
  }

  if (step === "code") {
    return (
      <AuthLayout
        key="code"
        title="Check your email"
        focusTitle
        back={
          <BackButton
            disabled={pending}
            onClick={() => {
              goTo(confirming ? "password" : "email");
              setConfirming(false);
              setCode("");
              setError(null);
              setNotice(null);
            }}
          />
        }
      >
        <p className="text-body-s text-indigo-black/70">
          {confirming
            ? `We sent a ${CODE_LENGTH}-digit code to ${email.trim()} to confirm your account.`
            : `We sent a ${CODE_LENGTH}-digit code to ${email.trim()}.`}
        </p>
        <form method="post" onSubmit={submitCode} className="flex flex-col gap-4 py-5" noValidate>
          <CodeInput value={code} onChange={setCode} error={error ?? undefined} disabled={pending} />
          <Button type="submit" pending={pending}>
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
    <AuthLayout key="email" title={copy.title} focusTitle={moved} back={<BackLinkHome />}>
      {initialError ? <ErrorMessage>{initialError}</ErrorMessage> : null}
      <GoogleButton href={googleSignInPath(next)} />
      <p className="text-center text-body-s text-navy">or</p>
      <form method="post" onSubmit={submitEmail} className="flex flex-col gap-4 py-5" noValidate>
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
        <Button type="submit" disabled={cooldown > 0} pending={pending}>
          {cooldown > 0 ? `Email me a code in ${cooldown}s` : "Email me a code"}
        </Button>
      </form>
      <Button variant="link" className="self-center text-violet" onClick={() => goTo("password")}>
        Use a password instead
      </Button>
      <p className="flex min-h-11 items-center justify-center gap-1 text-body-s text-indigo-black">
        {copy.switchText}
        {mode === pageMode ? (
          <Link href={mode === "sign-up" ? signInPath(next) : signUpPath(next)} className={SWITCH_LINK}>
            {copy.switchLink}
          </Link>
        ) : (
          // Switched here by "Log in instead": the link would point at this same
          // page, so the form switches back instead.
          <button type="button" className={SWITCH_LINK} onClick={() => setMode(pageMode)}>
            {copy.switchLink}
          </button>
        )}
      </p>
      <p className="text-center text-body-s text-indigo-black/70">
        Cense saves your email, your quiz answers, the cards you track and which issuer links you open. We never ask for
        your Social Security number or date of birth.
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
  // Log-in with the right password on an account that was never confirmed.
  onUnconfirmed: (email: string) => Promise<void>;
  onUseCode: () => void;
  // Sign-up with an email that already has an account.
  onLogIn: (email: string) => void;
};

// Password sign-up and log-in (the auth frames' password fields and error
// states), calling Mabelle's PR #24 routes. Until #24 is merged the routes do
// not exist, and the screen says so instead of failing silently.
function PasswordStep({ mode, title, initialEmail, onDone, onConfirmEmail, onUnconfirmed, onUseCode, onLogIn }: PasswordStepProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; repeat?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  // The email already has an account: offer to log in instead.
  const [accountExists, setAccountExists] = useState(false);
  const signUp = mode === "sign-up";
  const isMounted = useIsMounted();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  // The title stays the same on this step, so focus goes to its first field to
  // show that the form changed (WCAG 2.4.3).
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // After the answer, once the field is enabled again, so the message is announced.
  useEffect(() => {
    if (accountExists) emailRef.current?.focus();
  }, [accountExists]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
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
    if (Object.keys(next).length > 0) {
      // Focus the first field to fix, so its error is what gets announced.
      (next.email ? emailRef : next.password ? passwordRef : repeatRef).current?.focus();
      return;
    }

    setPending(true);
    const body = { email: email.trim(), password };
    const result = signUp
      ? await pendingRequest("POST /auth/password/signup", body)
      : await pendingRequest("POST /auth/password/signin", body);
    if (!isMounted()) return;
    if (result.kind === "ok") {
      if (result.data.status === "check_email") {
        setPending(false);
        onConfirmEmail(email);
        return;
      }
      onDone();
      return;
    }
    if (result.kind === "failed" && result.code === "email_not_confirmed") {
      // Stays pending (Log in, Back and the code link disabled) until the code
      // step replaces this one, so a second tap cannot send a second code.
      await onUnconfirmed(email);
      return;
    }
    setPending(false);
    if (result.kind === "unavailable") {
      setErrors({ form: "Password sign-in isn’t available yet. Use Google or an email code." });
    } else if (result.kind === "failed" && result.code === "account_exists") {
      setErrors({ email: "An account already uses this email." });
      setAccountExists(true);
    } else if (result.kind === "failed" && result.code === "invalid_credentials") {
      setErrors({ password: "Not quite. Give your password another try." });
    } else {
      setErrors({ form: result.kind === "failed" ? result.message : FALLBACK_MESSAGE });
    }
  }

  return (
    <AuthLayout title={title} back={<BackButton disabled={pending} onClick={onUseCode} />}>
      <form method="post" onSubmit={submit} className="flex flex-col gap-3 py-5" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Your email"
          ref={emailRef}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setAccountExists(false);
          }}
          error={errors.email}
          disabled={pending}
        />
        {accountExists ? (
          <Button variant="link" className="self-start text-violet" onClick={() => onLogIn(email)}>
            Log in instead
          </Button>
        ) : null}
        <PasswordField
          label="Password"
          name="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          placeholder="Your password"
          ref={passwordRef}
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
            ref={repeatRef}
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
          href={ROUTES.forgotPassword}
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
