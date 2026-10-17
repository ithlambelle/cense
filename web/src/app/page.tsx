import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WelcomeScreen } from "@/components/welcome/welcome-screen";
import { authenticatedStudent } from "@/lib/api/auth";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "CENSE" };

// Welcome is for new visitors. A signed-in student goes to /start, which picks
// the right screen for them.
export default async function WelcomePage() {
  const student = await authenticatedStudent();
  if (student) redirect(ROUTES.start);
  return <WelcomeScreen />;
}
