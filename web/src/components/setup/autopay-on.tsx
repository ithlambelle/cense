// Created with Claude Code (2026-11-08). I5, "Autopay is on" (Figma Design
// Edits 477:1719, US-10): a summary of what the student said, and that the
// issuer owns the setting. Ben, Nov 4: while autopay is on, due-date
// reminders are off (claim_due_reminders skips payment_due).

import Link from "next/link";

import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { SENSITIVE } from "@/lib/analytics";
import { cardSetupPath, paymentRemindersPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { HandoffStrip, InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

export function AutopayOn({
  applicationId,
  cardName,
  issuerName,
  amount,
  nextPayment,
}: {
  applicationId: string;
  cardName: string;
  issuerName: string | null;
  // "Statement balance", or null when the student never said.
  amount: string | null;
  // "Dec 6", or null without a saved due day.
  nextPayment: string | null;
}) {
  return (
    <SetupScreen back={{ href: cardSetupPath(applicationId), label: "Card setup" }}>
      <HandoffStrip issuer={issuerName ?? "Your card"} stage="done" />
      <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-pill bg-green">
        <svg width="22" height="17" viewBox="0 0 22 17" fill="none">
          <path d="M2 8.5L8 14.5L20 2.5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-navy" />
        </svg>
      </span>
      <SetupHeading>Autopay is on</SetupHeading>
      <p className="text-body-m text-indigo-black">Due date reminders stay off.</p>

      {/* Card / Default (477:1735): what the student said, nothing Cense saw. */}
      <section aria-label="Your autopay" className="flex w-full flex-col gap-2 rounded-card border-[1.5px] border-violet bg-white p-5">
        <h2 className="font-heading text-h6 font-medium text-navy">{cardName}</h2>
        {amount ? (
          <div className="flex items-center py-2 text-body-s">
            <p className="flex-1 text-indigo-black">Autopay amount</p>
            <p className={cn(SENSITIVE, "font-semibold text-navy")}>{amount}</p>
          </div>
        ) : null}
        <div className="flex items-center py-2 text-body-s">
          <p className="flex-1 text-indigo-black">Next payment</p>
          {nextPayment ? (
            <p className="font-semibold text-navy">{nextPayment}</p>
          ) : (
            <Link href={paymentRemindersPath(applicationId, "setup")} className="font-semibold text-violet underline underline-offset-2">
              Add your dates
            </Link>
          )}
        </div>
      </section>

      <Spacer />
      <InfoCallout title={issuerName ? `Changes happen at ${issuerName}` : "Changes happen at your card"}>
        {issuerName ? `Amount or timing changes are made in the ${issuerName} app.` : "Amount or timing changes are made in your card's app."}
      </InfoCallout>
      <Link href={ROUTES.home} className={buttonVariants()}>
        Back to Home
        <ButtonChevron />
      </Link>
    </SetupScreen>
  );
}
