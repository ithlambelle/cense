import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BudgetView } from "@/components/budget/budget-view";
import { JORDAN_OVER_BUDGET, SAM_WITH_SURPLUS } from "@/lib/budget/personas";
import { devPagesEnabled } from "@/lib/dev-only";

export const metadata: Metadata = { title: "Budget preview", robots: { index: false } };

// The budget waterfall on made-up students, for design review. Nothing here
// reads or saves a real student's data. ?persona=sam (default) has money left
// over; ?persona=jordan has needs that are more than the income.
const PERSONAS = {
  sam: { name: "Sam", input: SAM_WITH_SURPLUS },
  jordan: { name: "Jordan", input: JORDAN_OVER_BUDGET },
} as const;

export default async function BudgetPreviewPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  if (!devPagesEnabled()) notFound();
  const { persona } = await searchParams;
  const chosen = persona === "jordan" ? PERSONAS.jordan : PERSONAS.sam;
  return <BudgetView initial={chosen.input} personaName={chosen.name} />;
}
