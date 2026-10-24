import CircleInfo from "@gravity-ui/icons/CircleInfo";
import Image from "next/image";
import Link from "next/link";

import { IssuerActions } from "@/components/cards/issuer-actions";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { FactChip } from "@/components/ui/fact-chip";
import { StatusPill } from "@/components/ui/status-pill";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import type { Card } from "@/lib/cards/catalog";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { cardDisplayName, cardTypeLabel } from "@/lib/copy/results";
import { moneyAmount } from "@/lib/money";
import { applicationPath, cardBackLink } from "@/lib/routes";
import { cardNotes } from "@/lib/rules/fit-tier";

// A card's page (S14). There is no hi-fi frame yet: built from the result
// card's parts (type line, card symbol, fact chips) and the lo-fi hand-off
// board (219:909), and proposed to design.
export function CardDetailView({
  card,
  signedIn,
  from,
  tracked = null,
}: {
  card: Card;
  signedIn: boolean;
  from?: string | string[];
  // The student's tracked application for this card, if any.
  tracked?: Application | null;
}) {
  const back = cardBackLink(from);
  const approval = card.conditions.filter((condition) => condition.affects === "approval");
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-[9px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body-s text-indigo-black">{cardTypeLabel(card)}</p>
              <Image src="/icons/card-symbol.svg" alt="" width={24} height={18} />
            </div>
            <h1 className="font-heading text-h3 font-medium text-navy">{cardDisplayName(card)}</h1>
            <p className="text-body-s text-indigo-black/70">{card.brand}</p>
          </div>

          {signedIn && tracked ? <TrackedStatus application={tracked} /> : null}

          <dl className="flex flex-wrap gap-3">
            <FactChip label="Annual fee" value={moneyAmount(card.annualFeeCents)} />
            {card.secured && card.depositMinCents > 0 ? (
              <FactChip label="Deposit" value={`From ${moneyAmount(card.depositMinCents)}`} />
            ) : null}
            <FactChip label="Credit check" value={card.runsCreditCheck ? "Yes" : "No"} />
            <FactChip label="Foreign fee" value={`${card.foreignTransactionFeePercent}%`} />
          </dl>

          {approval.length > 0 ? (
            <section aria-labelledby="what-to-know" className="flex flex-col gap-3 rounded-card bg-off-white p-5">
              <h2 id="what-to-know" className="font-heading text-h6 font-medium text-navy">
                What the issuer says about approval
              </h2>
              <ul className="flex flex-col gap-2">
                {approval.map((condition) => (
                  <li key={condition.kind} className="flex items-start gap-3 text-body-s text-indigo-black">
                    {/* An info mark, not a check: many of these are reasons an issuer says no. */}
                    <CircleInfo aria-hidden="true" width={18} height={18} className="mt-0.5 shrink-0 text-violet" />
                    <span>{condition.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <IssuerActions
            card={{
              id: card.id,
              brand: card.brand,
              name: card.name,
              preapprovalUrl: card.preapprovalUrl,
              referralDisclosure: card.referralDisclosure,
            }}
            notes={cardNotes(card).map((note) => note.text)}
            signedIn={signedIn}
          />
        </main>
        {signedIn ? (
          <div className="sticky bottom-0">
            <BottomNav />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The student's status for a card they track, with the way to change it
// (US-05). No frame yet: built from the status pill, the link button and the
// hairline card, and proposed to design. Mark result's back returns here.
function TrackedStatus({ application }: { application: Application }) {
  return (
    <section aria-label="Your status" className="flex flex-col rounded-card border border-hairline pt-3 pr-4 pb-1 pl-5">
      <p className="text-body-s text-indigo-black">Your status</p>
      <div className="flex items-center justify-between gap-3">
        <StatusPill className={SENSITIVE}>{STATUS_LABELS[application.status].toUpperCase()}</StatusPill>
        <Link
          href={applicationPath(application.id, "card")}
          className={buttonVariants({ variant: "link", className: "w-auto text-violet" })}
        >
          Update status
        </Link>
      </div>
    </section>
  );
}
