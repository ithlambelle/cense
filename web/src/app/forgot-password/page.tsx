import type { Metadata } from "next";

import { ForgotPassword } from "@/components/auth/forgot-password";

export const metadata: Metadata = { title: "Forgot password | CENSE" };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
