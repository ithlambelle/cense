import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReadingView } from "@/components/safe-to-spend/reading-view";
import { plaidConfig } from "@/lib/plaid/config";
import { linkStatus } from "@/lib/plaid/store";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Reading your bank | CENSE" };

// Created with Claude Code (2026-11-21). Right after a bank links (step L1,
// Figma 821:8555): Cense reads what the bank shows instead of asking.
export default async function SafeToSpendReadingPage() {
  const student = await requireStudent(ROUTES.safeToSpendReading);
  if (!plaidConfig()) notFound();
  const status = await linkStatus(student);
  if (!status.ok) throw new Error("Could not read the student's bank link.");
  if (status.value === null) redirect(ROUTES.safeToSpendConnect);
  return <ReadingView />;
}
