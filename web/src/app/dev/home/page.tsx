import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomeView } from "@/components/home/home-view";
import { listCards } from "@/lib/cards/catalog";
import { devPagesEnabled } from "@/lib/dev-only";
import type { Application } from "@/lib/api/application";
import { homeState } from "@/lib/home/state";
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

// Every Home state on sample data, without signing in.
// ?state=no_quiz (default), started, matched, stretch, no_card, applied, rejected, approved, several.
// Add &celebrate=1 to approved for the arrival from Mark result, and &lit=0 to 3
// for that many stars. The approved card uses sample stars and saves nothing.
export default async function HomePreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; celebrate?: string; lit?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { state = "no_quiz", celebrate, lit } = await searchParams;
  const sampleStars = Math.min(3, Math.max(0, Number.parseInt(lit ?? "0", 10) || 0));
  const cards = listCards();
  const none = computeResult(undefined, cards);
  const views = {
    no_quiz: homeState([], none, false),
    started: homeState([], computeResult({ under21: true }, cards), true),
    matched: homeState([], computeResult(ALL_SIX, cards), true),
    stretch: homeState([], computeResult({ ...ALL_SIX, recentDenial: true }, cards), true),
    no_card: homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), true),
    applied: homeState([app("applied")], none, true),
    rejected: homeState([app("rejected")], none, true),
    approved: homeState([app("approved", { creditLimitCents: 50000 })], none, true),
    several: homeState(
      [
        app("rejected", { id: "00000000-0000-4000-8000-000000000002", cardName: "Capital One Platinum Secured", statusUpdatedAt: "2026-10-01T00:00:00Z" }),
        app("applied"),
      ],
      none,
      true,
    ),
  };
  // Own keys only, so ?state=constructor falls back instead of crashing.
  return (
    <HomeView
      state={Object.hasOwn(views, state) ? views[state as keyof typeof views] : views.no_quiz}
      initial="M"
      celebrateId={celebrate ? SAMPLE_ID : null}
      sampleStars={sampleStars}
    />
  );
}
