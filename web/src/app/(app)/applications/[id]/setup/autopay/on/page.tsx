// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AutopayOn } from "@/components/setup/autopay-on";
import { applicationIdSchema } from "@/lib/api/schemas";
import { calendarDate, safeTimeZone } from "@/lib/api/reminders";
import { autopayBackLink, autopayOnPath, autopayOrigin, cardOrigin } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";
import { nextPaymentLabel, paymentTypeLabel } from "@/lib/setup/progress";

export const metadata: Metadata = { title: "Autopay is on | CENSE" };

// I5, "Autopay is on" (US-10): what the student said, and where to change it.
// Only while autopay is on; otherwise the setup list, or the card's page when
// opened from it (?from=card, with that page's own origin in card_from).
export default async function AutopayOnPage({ params, searchParams }: PageProps<"/applications/[id]/setup/autopay/on">) {
  const { id } = await params;
  const query = await searchParams;
  const from = autopayOrigin(query.from);
  const cardFrom = cardOrigin(query.card_from);
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(autopayOnPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  if (setup.application.autopayStatus !== "on") redirect(autopayBackLink(id, from, setup.application.cardId, cardFrom).href);
  // No time zone is saved for students yet: the reminders' default (America/New_York).
  const today = calendarDate(new Date().toISOString(), safeTimeZone(null));
  return (
    <AutopayOn
      applicationId={id}
      cardName={setup.application.cardName}
      issuerName={setup.issuer?.name ?? setup.brand}
      amount={paymentTypeLabel(setup.application.autopayPaymentType)}
      nextPayment={nextPaymentLabel(setup.application.paymentDueDay, today)}
      from={from}
      cardId={setup.application.cardId}
      cardFrom={cardFrom}
    />
  );
}
