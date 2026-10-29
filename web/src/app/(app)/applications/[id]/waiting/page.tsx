import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WaitingView } from "@/components/applications/waiting-view";
import { applicationIdSchema } from "@/lib/api/schemas";
import { findCard } from "@/lib/cards/catalog";
import { applicationBackLink, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Still waiting | CENSE" };

// ?from=card when Mark result was opened from the card's page: the back arrow
// returns there, else Home.
export default async function WaitingPage({ params, searchParams }: PageProps<"/applications/[id]/waiting">) {
  const { id } = await params;
  const { from } = await searchParams;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(ROUTES.home);
  const application = await loadApplication(student, id);
  if (!application) notFound();
  const cardId = application.cardId && findCard(application.cardId) ? application.cardId : null;
  const origin = from === "card" && cardId ? "card" : undefined;
  return <WaitingView application={application} back={applicationBackLink(origin, cardId)} from={origin} />;
}
