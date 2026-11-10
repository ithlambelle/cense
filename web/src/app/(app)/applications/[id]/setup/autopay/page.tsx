// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutopaySteps } from "@/components/setup/autopay-steps";
import { applicationIdSchema } from "@/lib/api/schemas";
import { autopayStepsPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "Turn on autopay | CENSE" };

// I2, the issuer's autopay steps (US-10), for one of the student's approved cards.
export default async function AutopayStepsPage({ params }: PageProps<"/applications/[id]/setup/autopay">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(autopayStepsPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  return <AutopaySteps applicationId={id} brand={setup.brand} issuer={setup.issuer} />;
}
