import type { Metadata } from "next";

import { ResetPassword } from "@/components/auth/reset-password";

export const metadata: Metadata = { title: "Set a new password | CENSE" };

export default function ResetPasswordPage() {
  return <ResetPassword />;
}
