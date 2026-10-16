import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsView } from "@/components/results/results-view";
import { listCards } from "@/lib/cards/catalog";
import { devPagesEnabled } from "@/lib/dev-only";
import { computeResult } from "@/lib/results/compute";

export const metadata: Metadata = { title: "Result preview", robots: { index: false } };

// Sample answers run through the real rules and catalog, so the result screen
// can be checked without signing in. ?state=match (default), stretch, no_card or unfinished.
const SAMPLES: Record<string, unknown> = {
  match: { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true },
  stretch: { under21: false, incomeBand: "5k_to_15k", student: true, standing: "none", recentDenial: true, canDeposit: false },
  no_card: { under21: true, incomeBand: "none", student: true, standing: "none", recentDenial: false, canDeposit: true },
  unfinished: {},
};

export default async function ResultPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { state } = await searchParams;
  return <ResultsView view={computeResult(SAMPLES[state ?? "match"] ?? SAMPLES.match, listCards())} />;
}
