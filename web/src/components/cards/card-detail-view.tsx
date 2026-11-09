import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Image from "next/image";
import Link from "next/link";

import { CardArt } from "@/components/cards/card-art";
import { IssuerActions } from "@/components/cards/issuer-actions";
import { IssuerLooksFor } from "@/components/cards/issuer-looks-for";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { FactChip } from "@/components/ui/fact-chip";
import { StatusPill } from "@/components/ui/status-pill";
import { SENSITIVE } from "@/lib/analytics";
import type { Application } from "@/lib/api/application";
import type { Card } from "@/lib/cards/catalog";
import type { CardRewards } from "@/lib/cards/rewards";
import { depositLine } from "@/lib/cards/deposit";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { cardDisplayName, cardTypeLabel, ESTIMATE_DISCLAIMER, rateAmount, valueLine } from "@/lib/copy/results";
import type { ReminderStatus } from "@/lib/home/state";
import { moneyAmount } from "@/lib/money";
import { applicationPath, cardBackLink, cardOrigin, paymentRemindersPath, type CardOrigin } from "@/lib/routes";
import type { YearOneEstimate } from "@/lib/results/value";
import { cardNotes } from "@/lib/rules/fit-tier";
import { cn } from "@/lib/utils";

// A card's page (S14). There is no hi-fi frame yet: built from the result
// card's parts (type line, fact chips) and the lo-fi hand-off board (219:909),
// and proposed to design. Since 2026-11-07 it shows the issuer's card art and
// what the card earns (James, Oct 26: he wanted to see the card, and the page
// "looks like a legal document"), and the approval rules collapse to the first
// one (IssuerLooksFor, from the unmerged us11/card-page-redesign branch).
export function CardDetailView({
  card,
  signedIn,
  from,
  tracked = null,
  reminders = null,
  rewards = null,
  estimate = null,
}: {
  card: Card;
  signedIn: boolean;
  from?: string | string[];
  // The student's tracked application for this card, if any.
  tracked?: Application | null;
  // For an approved tracked card: its payment reminders.
  reminders?: ReminderStatus | null;
  // What the card earns (lib/cards/rewards.ts), null for a card with no data.
  rewards?: CardRewards | null;
  // The signed-in student's year-one estimate for this card, from their saved
  // spending answer (lib/results/value.ts). Null without one.
  estimate?: YearOneEstimate | null;
}) {
  const back = cardBackLink(from);
  const approval = card.conditions.filter((condition) => condition.affects === "approval");
  const deposit = depositLine(card);
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-[9px]">
            <CardArt src={rewards?.image ?? null} className="mb-2 w-36" />
            <p className="text-body-s text-indigo-black">{cardTypeLabel(card)}</p>
            <h1 className="font-heading text-h3 font-medium text-navy">{cardDisplayName(card)}</h1>
            <p className="text-body-s text-indigo-black/70">{card.brand}</p>
          </div>

          {signedIn && tracked ? <TrackedStatus application={tracked} reminders={reminders} from={cardOrigin(from)} /> : null}

          <dl className="flex flex-wrap gap-3">
            <FactChip label="Annual fee" value={moneyAmount(card.annualFeeCents)} />
            {card.secured && card.depositMinCents > 0 ? (
              <FactChip label="Deposit" value={`From ${moneyAmount(card.depositMinCents)}`} />
            ) : null}
            <FactChip label="Credit check" value={card.runsCreditCheck ? "Yes" : "No"} />
            <FactChip label="Foreign fee" value={`${card.foreignTransactionFeePercent}%`} />
          </dl>
          {/* What "secured" means for this card: the result frame's line (397:847), Inter 14/20 at 65%. */}
          {deposit ? <p className="-mt-3 text-body-s text-indigo-black/65">{deposit}</p> : null}

          {rewards ? <RewardsBox rewards={rewards} estimate={estimate} /> : null}

          <IssuerLooksFor rules={approval} />

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
            tracked={signedIn && tracked !== null}
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

// What the card earns, in the issuer's words (lib/cards/rewards.ts), with the
// student's year-one estimate on top when they answered the spending
// question. The white bordered box of "What the issuer looks for" (144:2936).
function RewardsBox({ rewards, estimate }: { rewards: CardRewards; estimate: YearOneEstimate | null }) {
  const yearOne = valueLine(estimate);
  return (
    <section
      aria-labelledby="rewards"
      className="flex flex-col gap-3 rounded-card border-[1.5px] border-off-white bg-white px-5 py-4"
    >
      <h2 id="rewards" className="font-heading text-h6 font-medium text-navy">
        Rewards
      </h2>
      {yearOne ? (
        // Restates the student's spending: masked from session replay.
        <div className={cn(SENSITIVE, "flex flex-col gap-0.5")}>
          <p className="text-body-m font-medium text-navy">
            About <span className="font-number font-medium">{yearOne.amount}</span> in your first year
          </p>
          <p className="text-body-s text-indigo-black/70">{yearOne.detail}</p>
          <p className="text-caption text-indigo-black/65">{ESTIMATE_DISCLAIMER}</p>
        </div>
      ) : null}
      {rewards.rates.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rewards.rates.map((rate) => (
            <li key={`${rate.amount}-${rate.category}`} className="flex items-start gap-3">
              <span className="w-12 shrink-0 font-number text-number-m font-medium text-indigo-black">{rateAmount(rate)}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-body-s text-indigo-black">{rate.category}</span>
                {rate.condition ? <span className="text-caption text-indigo-black/65">{rate.condition}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-indigo-black">No rewards on purchases.</p>
      )}
      {rewards.bonus ? (
        <div className="flex items-start gap-3 rounded-[14px] bg-off-white px-3.5 py-3">
          <Image src="/icons/fit-check.svg" alt="" width={14} height={11} className="mt-1.5 shrink-0" />
          <p className="text-body-s text-indigo-black">
            <span className="font-semibold">Sign-up bonus: </span>
            {rewards.bonus.summary}
          </p>
        </div>
      ) : null}
    </section>
  );
}

const REMINDER_STATUS: Record<ReminderStatus, string> = {
  on: "On",
  off: "Off",
  not_set: "Not set yet",
};

// The student's status for a card they track, with the way to change it
// (US-05). No frame yet: the box is the card page's white bordered box ("What
// the issuer looks for", 144:2936: 1.5px off-white border, radius 22, 20/16
// padding), with the status pill and the outline button ("Compare side by
// side", 144:2785) full width below. Mark result's back returns here. An
// approved card adds its payment reminders as Home's List row, Tinted
// (273:2196), which opens the reminder screen; its Back and Save return here.
function TrackedStatus({
  application,
  reminders,
  from,
}: {
  application: Application;
  reminders: ReminderStatus | null;
  // Where this card page was opened from, kept for the reminder screen's Back.
  from: CardOrigin | undefined;
}) {
  return (
    <section
      aria-labelledby="your-status"
      className="flex flex-col gap-3 rounded-card border-[1.5px] border-off-white bg-white px-5 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        {/* The card page's section heading style, as "What the issuer looks for". */}
        <h2 id="your-status" className="font-heading text-h6 font-medium text-navy">
          Your status
        </h2>
        <StatusPill className={SENSITIVE}>{STATUS_LABELS[application.status].toUpperCase()}</StatusPill>
      </div>
      <Link href={applicationPath(application.id, "card")} className={buttonVariants({ variant: "outline" })}>
        Update status
      </Link>
      {application.status === "approved" && reminders ? (
        <Link
          href={paymentRemindersPath(application.id, "card", from)}
          className="flex min-h-11 items-center gap-3 rounded-[14px] bg-off-white px-3.5 py-3 text-indigo-black hover:bg-selected-outline/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
            <span className="text-body-m leading-[normal] font-medium">Payment reminders</span>
            <span className="text-body-s leading-[normal] text-indigo-black/70">{REMINDER_STATUS[reminders]}</span>
          </span>
          <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black/70" />
        </Link>
      ) : null}
    </section>
  );
}
