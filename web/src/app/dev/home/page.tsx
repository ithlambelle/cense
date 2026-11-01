import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomeView } from "@/components/home/home-view";
import { listCards } from "@/lib/cards/catalog";
import { devPagesEnabled } from "@/lib/dev-only";
import type { Application } from "@/lib/api/application";
import { homeState, type CardDetail } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

export const metadata: Metadata = { title: "Home preview", robots: { index: false } };

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

const SAMPLE_ID = "00000000-0000-4000-8000-000000000001";

function app(status: Application["status"], extra: Partial<Application> = {}): Application {
  return {
    id: SAMPLE_ID,
    cardId: "discover-it-student-cash-back",
    cardName: "Discover it Student Cash Back",
    status,
    creditLimitCents: null,
    appliedAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
    ...extra,
  };
}

// The leading card's denial reason and autopay for each sample.
const DETAILS: Record<string, CardDetail> = {
  rejected: { denialReason: null, denialReasonNote: null, autopayStatus: "unknown", paymentDueDay: null },
  denied: { denialReason: "no_credit_history", denialReasonNote: null, autopayStatus: "unknown", paymentDueDay: null },
  waiting: { denialReason: "no_letter_yet", denialReasonNote: null, autopayStatus: "unknown", paymentDueDay: null },
};

// Every Home state on sample data, without signing in.
// ?state=no_quiz (default), started, matched, stretch, no_card, applied,
// rejected (no reason yet), denied (with a reason), waiting (no letter yet),
// approved, several.
// Add &celebrate=1 to approved for the arrival from Mark result, and &lit=
// for that many stars (0 to 3 approved, 0 to 5 denied). The approved and
// denied cards use sample stars and save nothing.
export default async function HomePreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; celebrate?: string; lit?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { state = "no_quiz", celebrate, lit } = await searchParams;
  const sampleStars = Math.min(5, Math.max(0, Number.parseInt(lit ?? "0", 10) || 0));
  const cards = listCards();
  const none = computeResult(undefined, cards);
  const views = {
    no_quiz: homeState([], none, 0),
    started: homeState([], computeResult({ under21: true }, cards), 1),
    matched: homeState([], computeResult(ALL_SIX, cards), 1),
    stretch: homeState([], computeResult({ ...ALL_SIX, recentDenial: true }, cards), 1),
    no_card: homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), 1),
    applied: homeState([app("applied")], none, 1),
    rejected: homeState([app("rejected")], none, 1),
    denied: homeState([app("rejected")], none, 1),
    waiting: homeState([app("rejected")], none, 1),
    approved: homeState([app("approved", { creditLimitCents: 50000 })], none, 1),
    several: homeState(
      [
        app("rejected", { id: "00000000-0000-4000-8000-000000000002", cardName: "Capital One Platinum Secured", statusUpdatedAt: "2026-10-01T00:00:00Z" }),
        app("applied"),
      ],
      none,
      0,
    ),
  };
  // Own keys only, so ?state=constructor falls back instead of crashing.
  return (
    <HomeView
      state={Object.hasOwn(views, state) ? views[state as keyof typeof views] : views.no_quiz}
      initial="M"
      detail={Object.hasOwn(DETAILS, state) ? DETAILS[state] : null}
      celebrateId={celebrate ? SAMPLE_ID : null}
      sampleStars={sampleStars}
    />
  );
}
