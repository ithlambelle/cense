import type { Metadata } from "next";

import { ResultsFlow } from "@/components/results/results-flow";

import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your card match | CENSE" };

export default async function ResultsPage() {
  await requireStudent(ROUTES.results);
  return <ResultsFlow />;
}
