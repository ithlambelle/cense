import type { Metadata } from "next";

import { CardListView } from "@/components/cards/card-list-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { listCards } from "@/lib/cards/catalog";

export const metadata: Metadata = { title: "Student cards | CENSE" };

// Open to everyone: no account is needed to browse.
export default async function CardsPage() {
  const student = await authenticatedStudent();
  return <CardListView cards={listCards()} signedIn={student !== null} />;
}
