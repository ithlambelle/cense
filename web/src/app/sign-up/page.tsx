import type { Metadata } from "next";

import { SignInFlow } from "@/components/auth/sign-in-flow";
import { allowedNext } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign up | CENSE" };

// Same screen as sign-in with sign-up wording; an email code creates the
// account on first use. The API sends Google failures to /sign-in.
// A Map, so a crafted value such as ?error=constructor finds nothing.
const GOOGLE_ERRORS = new Map([
  ["cancelled", "Google sign-in was canceled. Try again, or use an email code."],
  ["callback", "Google sign-in didn’t finish. Try again, or use an email code."],
]);

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const errorKey = first(params.error);

  return (
    <SignInFlow
      mode="sign-up"
      next={allowedNext(first(params.next))}
      initialError={errorKey ? (GOOGLE_ERRORS.get(errorKey) ?? null) : null}
    />
  );
}
