import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/lib/dev-only";

export const metadata: Metadata = { title: "All screens", robots: { index: false } };

type Entry = { label: string; href: string; note?: string };

// Every MVP1 screen and state in one place, for the localhost walkthrough (plan B8).
const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "Start",
    entries: [
      { label: "S1 Welcome", href: "/", note: "Signed-in visitors are sent on to /start" },
      { label: "S2 Sign up", href: "/sign-up" },
      { label: "S2 Sign in", href: "/sign-in" },
      { label: "S13 Card list", href: "/cards" },
      { label: "S14 Card page (secured)", href: "/cards/discover-it-secured-cash-back" },
      { label: "S14 Card page (student)", href: "/cards/discover-it-student-cash-back" },
    ],
  },
  {
    title: "Quiz and result",
    entries: [
      { label: "S10 Quiz (preview, nothing saved)", href: "/dev/quiz" },
      { label: "S11 Finding your cards", href: "/dev/loading" },
      { label: "S12 Result: match", href: "/dev/results" },
      { label: "S12 Result: stretch", href: "/dev/results?state=stretch" },
      { label: "S12 Result: no card", href: "/dev/results?state=no_card" },
      { label: "S12 Result: quiz unfinished", href: "/dev/results?state=unfinished" },
    ],
  },
  {
    title: "Home",
    entries: [
      ...["no_quiz", "started", "matched", "no_card", "applied", "rejected", "approved", "several"].map((state) => ({
        label: `Home: ${state.replace("_", " ")}`,
        href: `/dev/home?state=${state}`,
      })),
      { label: "Home: just approved (from Mark result)", href: "/dev/home?state=approved&celebrate=1" },
    ],
  },
  {
    title: "Budget (prototype, made-up numbers)",
    entries: [
      { label: "Budget: money left over (Sam)", href: "/dev/budget" },
      { label: "Budget: needs more than income (Jordan)", href: "/dev/budget?persona=jordan" },
    ],
  },
  {
    title: "Account and other",
    entries: [
      { label: "S28 Account", href: "/dev/preview?screen=account" },
      { label: "Add a card I already have", href: "/dev/preview?screen=add-card" },
      { label: "S30 Not found", href: "/this-page-does-not-exist" },
    ],
  },
  {
    title: "After applying",
    entries: [
      { label: "S18 Mark your result", href: "/dev/preview?screen=mark-result" },
      { label: "S19 Still waiting", href: "/dev/preview?screen=waiting" },
      { label: "S13 Card list (signed in, quiz done)", href: "/dev/preview?screen=cards-matched" },
      { label: "S14 Card page (signed in, for the hand-off sheets)", href: "/dev/preview?screen=card-signed-in" },
      { label: "S20 First-month plan", href: "/dev/preview?screen=plan" },
      { label: "US-08 Payment reminders", href: "/dev/preview?screen=payment-reminders" },
      { label: "US-08 Payment reminders: save fails", href: "/dev/preview?screen=payment-reminders-error" },
      { label: "S21 Denial Options", href: "/dev/preview?screen=denied" },
      { label: "S21 Denial reason", href: "/dev/preview?screen=denied-reason" },
      { label: "S21 Denial reason: saving", href: "/dev/preview?screen=denied-reason-saving" },
      { label: "S21 Denial reason: save failed", href: "/dev/preview?screen=denied-reason-error" },
      { label: "A1 No letter yet", href: "/dev/preview?screen=denied-no-letter" },
      { label: "S22 Five-step plan", href: "/dev/preview?screen=denied-plan" },
      { label: "S22 Five-step plan with reason note", href: "/dev/preview?screen=denied-plan-reason" },
      { label: "S23 Choose when to check in", href: "/dev/preview?screen=reminder" },
      { label: "S24 Reminder saved", href: "/dev/preview?screen=reminder-saved" },
      { label: "S25 Contact the issuer", href: "/dev/preview?screen=fixable" },
      { label: "S26 Second look: ask", href: "/dev/preview?screen=second-look" },
      { label: "S26 Second look: approved", href: "/dev/preview?screen=second-look-approved" },
      { label: "S27 Second look: not approved", href: "/dev/preview?screen=second-look-not-approved" },
    ],
  },
];

export default function ScreensPage() {
  if (!devPagesEnabled()) notFound();
  return (
    <main className="mx-auto flex max-w-phone flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h2 font-medium text-navy">All screens</h1>
        <p className="text-body-s text-indigo-black">Development only. Sample data where a screen needs a signed-in student.</p>
      </div>
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h2 className="font-heading text-h6 font-medium text-indigo-black">{group.title}</h2>
          <ul className="flex flex-col gap-1">
            {group.entries.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className="text-body-m text-violet underline underline-offset-2">
                  {entry.label}
                </Link>
                {entry.note ? <p className="text-body-s text-indigo-black/70">{entry.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
