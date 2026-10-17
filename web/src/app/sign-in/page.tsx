import type { Metadata } from "next";

import { SignInFlow } from "@/components/auth/sign-in-flow";
import { googleErrorMessage } from "@/lib/copy/auth";
import { allowedNext } from "@/lib/routes";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sign in | CENSE" };

// The API sends a visitor back here with ?error= when Google sign-in fails.
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;

  return (
    <SignInFlow
      mode="sign-in"
      next={allowedNext(firstParam(params.next))}
      initialError={googleErrorMessage(firstParam(params.error))}
    />
  );
}
