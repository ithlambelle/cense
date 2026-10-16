import type { Metadata } from "next";

import { AccountScreen } from "@/components/home/log-out";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your account | CENSE" };

export default async function Page() {
  await requireStudent(ROUTES.home);
  return <AccountScreen />;
}
