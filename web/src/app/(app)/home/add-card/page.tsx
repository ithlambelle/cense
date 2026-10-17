import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AddCardScreen } from "@/components/home/add-card-form";
import { authenticatedStudent } from "@/lib/api/auth";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Add a card | CENSE" };

export default async function AddCardPage() {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <AddCardScreen />;
}
