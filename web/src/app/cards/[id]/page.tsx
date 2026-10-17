import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CardDetailView } from "@/components/cards/card-detail-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { findCard } from "@/lib/cards/catalog";
import { cardDisplayName } from "@/lib/copy/results";

export async function generateMetadata({ params }: PageProps<"/cards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const card = findCard(id);
  return { title: card ? `${cardDisplayName(card)} | CENSE` : "Card not found | CENSE" };
}

// Open to everyone. Signed-out visitors are sent to sign-in when they tap an
// issuer button, and come back to this card.
export default async function CardDetailPage({ params }: PageProps<"/cards/[id]">) {
  const { id } = await params;
  const card = findCard(id);
  if (!card) notFound();
  const student = await authenticatedStudent();
  return <CardDetailView card={card} signedIn={student !== null} />;
}
