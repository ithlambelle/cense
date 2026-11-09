// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CardSetupList } from "@/components/setup/card-setup-list";
import { applicationIdSchema } from "@/lib/api/schemas";
import { cardSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "Set up your card | CENSE" };

// I1, the card setup list (US-10), for one of the student's approved cards.
// Read on the server, so the stars are right on every arrival, Back included.
export default async function CardSetupPage({ params }: PageProps<"/applications/[id]/setup">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(cardSetupPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  return (
    <CardSetupList
      applicationId={id}
      cardName={setup.application.cardName}
      brand={setup.brand}
      creditLimitCents={setup.application.creditLimitCents}
      progress={setup.progress}
    />
  );
}
