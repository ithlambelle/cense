import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignedOutView } from "@/components/auth/signed-out-view";
import { ROUTES } from "@/lib/routes";
import { currentStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome back | CENSE" };

// Where Log out and Switch account land. Someone signed in is sent Home:
// this screen would not be true for them.
export default async function SignedOutPage() {
  if (await currentStudent()) redirect(ROUTES.home);
  return <SignedOutView />;
}
