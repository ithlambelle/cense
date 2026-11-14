import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AccountsView } from "@/components/your-money/accounts-view";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Accounts | CENSE" };

// Accounts (US-12, Figma E4): shown once a bank is linked. With none, the
// consent screen; Profile shows the row only once one is linked.
export default async function AccountsPage() {
  const student = await requireStudent(ROUTES.accounts);
  if (!plaidConfig()) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (!loaded.value) redirect(ROUTES.safeToSpendConnect);
  return <AccountsView data={loaded.value} />;
}
