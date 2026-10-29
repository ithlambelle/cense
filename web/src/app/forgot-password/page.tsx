import type { Metadata } from "next";

import { ForgotPassword } from "@/components/auth/forgot-password";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Forgot password | CENSE" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const linkExpired = firstParam((await searchParams).error) === "invalid_link";
  return <ForgotPassword linkExpired={linkExpired} />;
}
