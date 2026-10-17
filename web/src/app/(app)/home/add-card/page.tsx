import type { Metadata } from "next";

import { AddCardScreen } from "@/components/home/add-card-form";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Add a card | CENSE" };

export default async function AddCardPage() {
  await requireStudent(ROUTES.home);
  return <AddCardScreen />;
}
