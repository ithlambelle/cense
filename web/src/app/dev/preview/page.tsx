import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarkResult } from "@/components/applications/mark-result";
import { DeniedOptionsView } from "@/components/denied/options-view";
import { DeniedPlanView } from "@/components/denied/plan-view";
import { devPagesEnabled } from "@/lib/dev-only";
import type { Application } from "@/lib/home/state";

export const metadata: Metadata = { title: "Screen preview", robots: { index: false } };

const SAMPLE_ID = "00000000-0000-4000-8000-000000000001";
const SAMPLE_APPLICATION: Application = {
  id: SAMPLE_ID,
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "applied",
  creditLimitCents: null,
  appliedAt: "2026-10-16T12:00:00Z",
  statusUpdatedAt: "2026-10-16T12:00:00Z",
};

// Signed-in screens on sample data, without signing in. Saving from here
// fails (no session), which is expected.
const SCREENS = {
  "mark-result": () => <MarkResult application={SAMPLE_APPLICATION} />,
  denied: () => <DeniedOptionsView applicationId={SAMPLE_ID} />,
  "denied-plan": () => <DeniedPlanView applicationId={SAMPLE_ID} />,
} as const;

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { screen = "" } = await searchParams;
  const render = SCREENS[screen as keyof typeof SCREENS];
  if (!render) notFound();
  return render();
}
