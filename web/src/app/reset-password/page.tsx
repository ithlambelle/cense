import type { Metadata } from "next";

import { ResetPassword } from "@/components/auth/reset-password";
import { currentStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Set a new password | CENSE" };

// The account's email is shown, so a student who was sent someone else's
// reset link sees that it is not their account before choosing a password.
export default async function ResetPasswordPage() {
  const student = await currentStudent();
  return <ResetPassword email={student?.email ?? null} />;
}
