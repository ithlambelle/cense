import type { Metadata } from "next";

import { SignInFlow } from "@/components/auth/sign-in-flow";
import { googleErrorMessage } from "@/lib/copy/auth";
import { allowedNext } from "@/lib/routes";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sign up | CENSE" };

// Same screen as sign-in with sign-up wording; an email code creates the
// account on first use. The API sends Google failures to /sign-in.
export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;

  return (
    <SignInFlow
      mode="sign-up"
      next={allowedNext(firstParam(params.next))}
      initialError={googleErrorMessage(firstParam(params.error))}
    />
  );
}
