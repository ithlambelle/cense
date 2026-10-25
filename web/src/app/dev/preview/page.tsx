import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountView } from "@/components/account/account-view";
import { MarkResult } from "@/components/applications/mark-result";
import { WaitingView } from "@/components/applications/waiting-view";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { CardListView } from "@/components/cards/card-list-view";
import { NoLetterView } from "@/components/denied/no-letter-view";
import { DeniedOptionsView } from "@/components/denied/options-view";
import { DeniedPlanScreen } from "@/components/denied/plan-view";
import { FixableView } from "@/components/denied/fixable-view";
import { ReminderSavedView } from "@/components/denied/reminder-saved-view";
import { ReminderSetup } from "@/components/denied/reminder-setup";
import { SecondLook } from "@/components/denied/second-look";
import { AddCardScreen } from "@/components/home/add-card-form";
import { FirstMonthPlan } from "@/components/plan/first-month-plan";
import { findCard, listCards } from "@/lib/cards/catalog";
import { localDevOnly } from "@/lib/dev-only";
import type { Application } from "@/lib/api/application";
import { OFFLINE_MESSAGE } from "@/lib/api-client/client";

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

// Signed-in screens on sample data, without signing in. Local development
// only: with a real session (as on a Vercel preview) some of these screens
// would save for the visitor, so the page is off outside local development.
const SCREENS = {
  "mark-result": () => <MarkResult application={SAMPLE_APPLICATION} />,
  "mark-result-from-card": () => (
    <MarkResult application={SAMPLE_APPLICATION} back={{ href: "/cards/discover-it-student-cash-back", label: "Card details" }} />
  ),
  waiting: () => <WaitingView application={SAMPLE_APPLICATION} />,
  "card-signed-in": () => {
    const card = findCard("discover-it-student-cash-back");
    return card ? <CardDetailView card={card} signedIn /> : null;
  },
  "card-tracked": () => {
    const card = findCard("discover-it-student-cash-back");
    return card ? <CardDetailView card={card} signedIn tracked={SAMPLE_APPLICATION} /> : null;
  },
  "cards-matched": () => (
    <CardListView cards={listCards()} signedIn yourMatch={{ name: "Discover it Student Cash Back", tier: "likely_fit" }} />
  ),
  denied: () => <DeniedOptionsView applicationId={SAMPLE_ID} />,
  // The reason step as frame 144:2002 draws it, then mid-save and after a failed save.
  "denied-reason": () => (
    <DeniedOptionsView applicationId={SAMPLE_ID} preview={{ reason: "something_else", note: "Too many recent applications" }} />
  ),
  "denied-reason-saving": () => (
    <DeniedOptionsView
      applicationId={SAMPLE_ID}
      preview={{ reason: "something_else", note: "Too many recent applications", saving: "reason" }}
    />
  ),
  "denied-reason-error": () => (
    <DeniedOptionsView
      applicationId={SAMPLE_ID}
      preview={{ reason: "something_else", note: "Too many recent applications", error: { answer: "reason", message: OFFLINE_MESSAGE } }}
    />
  ),
  "denied-no-letter": () => <NoLetterView applicationId={SAMPLE_ID} />,
  // Shown on sample stars rather than loaded, so no session is needed.
  "denied-plan": () => <DeniedPlanScreen applicationId={SAMPLE_ID} start={{ done: [], state: "saved" }} />,
  "denied-plan-stars": () => (
    <DeniedPlanScreen applicationId={SAMPLE_ID} start={{ done: ["read_letter", "check_reports"], state: "saved" }} />
  ),
  "denied-plan-reason": () => (
    <DeniedPlanScreen
      applicationId={SAMPLE_ID}
      start={{ done: ["read_letter", "check_reports"], state: "saved" }}
      reason={{ reason: "no_credit_history", note: null }}
    />
  ),
  reminder: () => <ReminderSetup applicationId={SAMPLE_ID} />,
  "reminder-saved": () => <ReminderSavedView dateLabel="April 16, 2027" />,
  fixable: () => <FixableView applicationId={SAMPLE_ID} />,
  "second-look": () => <SecondLook applicationId={SAMPLE_ID} />,
  "second-look-approved": () => <SecondLook applicationId={SAMPLE_ID} initialView="approved" />,
  "second-look-not-approved": () => <SecondLook applicationId={SAMPLE_ID} initialView="not-approved" />,
  account: () => <AccountView email="student@example.edu" card={{ ...SAMPLE_APPLICATION, status: "approved", creditLimitCents: 50000 }} />,
  "add-card": () => <AddCardScreen />,
  plan: () => <FirstMonthPlan application={{ ...SAMPLE_APPLICATION, status: "approved", creditLimitCents: 50000 }} />,
} as const;

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (!localDevOnly()) notFound();
  const { screen = "" } = await searchParams;
  // Own keys only, so ?screen=constructor finds nothing instead of crashing.
  if (!Object.hasOwn(SCREENS, screen)) notFound();
  return SCREENS[screen as keyof typeof SCREENS]();
}
