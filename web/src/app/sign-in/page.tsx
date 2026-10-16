import type { Metadata } from "next";

import { SignInFlow } from "@/components/auth/sign-in-flow";
import { allowedNext } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in | CENSE" };

// The API sends a visitor back here with ?error= when Google sign-in fails.
// A Map, so a crafted value such as ?error=constructor finds nothing.
const GOOGLE_ERRORS = new Map([
  ["cancelled", "Google sign-in was cancelled. Try again, or use an email code."],
  ["callback", "Google sign-in didn’t finish. Try again, or use an email code."],
]);

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const errorKey = first(params.error);

  return (
    <SignInFlow
      next={allowedNext(first(params.next))}
      initialError={errorKey ? (GOOGLE_ERRORS.get(errorKey) ?? null) : null}
    />
  );
}
