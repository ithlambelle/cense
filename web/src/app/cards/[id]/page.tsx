import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IdentifyStudent } from "@/components/analytics/identify-student";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { findCard } from "@/lib/cards/catalog";
import { cardDisplayName } from "@/lib/copy/results";
import { isInternalStudent } from "@/lib/internal-students";
import { currentStudent } from "@/lib/session";

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
  const student = await currentStudent();
  return (
    <>
      {/* Outside the (app) layout, so a signed-in student is identified here too. */}
      {student ? (
        <IdentifyStudent studentId={student.studentId} isInternal={isInternalStudent(student.studentId)} />
      ) : null}
      <TrackOnMount event="card_details_viewed" props={{ card_id: card.id, signed_in: student !== null }} />
      <CardDetailView card={card} signedIn={student !== null} />
    </>
  );
}
