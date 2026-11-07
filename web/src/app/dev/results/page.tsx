import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultsView } from "@/components/results/results-view";
import { listCards } from "@/lib/cards/catalog";
import { devPagesEnabled } from "@/lib/dev-only";
import { computeResult } from "@/lib/results/compute";

export const metadata: Metadata = { title: "Result preview", robots: { index: false } };

// Sample answers run through the real rules, catalog and rewards data, so the
// result screen can be checked without signing in. ?state=match (default),
// spending, small_spender, stretch, no_card or unfinished. match has no
// spending answer, so no value lines; spending and small_spender answer it.
const CORE = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const SAMPLES: Record<string, unknown> = {
  match: CORE,
  spending: { ...CORE, spendingCategories: ["groceries", "food_and_dining"], spendingBand: "200_to_500" },
  // A sign-up bonus out of reach at under $200 a month.
  small_spender: { ...CORE, standing: "limited", spendingCategories: ["food_and_dining"], spendingBand: "under_200" },
  stretch: { under21: false, incomeBand: "5k_to_15k", student: true, standing: "none", recentDenial: true, canDeposit: false },
  no_card: { ...CORE, incomeBand: "none" },
  unfinished: {},
};

export default async function ResultPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { state } = await searchParams;
  return <ResultsView view={computeResult(SAMPLES[state ?? "match"] ?? SAMPLES.match, listCards())} />;
}
