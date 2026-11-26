import type { Metadata } from "next";

import { AddCardScreen } from "@/components/home/add-card-form";
import { listCards } from "@/lib/cards/catalog";
import { cardDisplayName } from "@/lib/copy/results";
import { openedFromAccount, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Add a card | CENSE" };

export default async function AddCardPage({ searchParams }: PageProps<"/home/add-card">) {
  await requireStudent(ROUTES.home);
  // Only each card's id and name reach the browser, not the catalog's facts.
  const catalog = listCards().map((card) => ({ id: card.id, name: cardDisplayName(card) }));
  return <AddCardScreen catalog={catalog} fromAccount={openedFromAccount((await searchParams).from)} />;
}
