import type { Metadata } from "next";

import { AddCardScreen } from "@/components/home/add-card-form";
import { openedFromAccount, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Add a card | CENSE" };

export default async function AddCardPage({ searchParams }: PageProps<"/home/add-card">) {
  await requireStudent(ROUTES.home);
  return <AddCardScreen fromAccount={openedFromAccount((await searchParams).from)} />;
}
