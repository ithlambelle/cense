import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

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
import { depositLine } from "@/lib/cards/deposit";
import { STATUS_LABELS } from "@/lib/copy/applications";
import { cardDisplayName, cardTypeLabel } from "@/lib/copy/results";
import type { ReminderStatus } from "@/lib/home/state";
import { moneyAmount } from "@/lib/money";
import { pennyFromCard } from "@/lib/penny/navigation";
import {
  applicationPath,
  cardBackLink,
  cardOrigin,
  paymentRemindersPath,
  pennyPath,
  type CardOrigin,
} from "@/lib/routes";
import { cardNotes } from "@/lib/rules/fit-tier";
import { cn } from "@/lib/utils";

// The card page's fact boxes (144:2909): they share the row, 8/6 padding.
const FACT_BOX = "min-w-0 px-2 py-1.5";

// The Learn answer the lesson link opens (Learn > Credit).
const PREAPPROVAL_ANSWER = "preapproval-vs-applying";

// A card's page (S14), from the approved frame "Card page / Why it fits"
// (Figma gPofkJWVZ2wUWyF9SfHW6O, 144:2904): type and issuer on one line, the
// name, fact boxes in one row, "What the issuer looks for", the lesson link
// and the issuer actions. The frame's "Why it fits" box and "Year one" box
// need fit reasons and rewards data the card page does not have yet.
export function CardDetailView({
  card,
  signedIn,
  from,
  tracked = null,
  reminders = null,
}: {
  card: Card;
  signedIn: boolean;
  from?: string | string[];
  // The student's tracked application for this card, if any.
  tracked?: Application | null;
  // For an approved tracked card: its payment reminders.
  reminders?: ReminderStatus | null;
}) {
  const back = cardBackLink(from);
  const approval = card.conditions.filter((condition) => condition.affects === "approval");
  const deposit = depositLine(card);
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          {/* 144:2906 and 144:2907: Inter 14 at 65%, then Sora SemiBold 24/32. */}
          <div className="flex flex-col gap-4">
            <p className="text-body-s text-indigo-black/65">
              {cardTypeLabel(card)} · {card.brand}
            </p>
            <h1 className="font-heading text-h3 font-medium text-navy">{cardDisplayName(card)}</h1>
          </div>

          {signedIn && tracked ? <TrackedStatus application={tracked} reminders={reminders} from={cardOrigin(from)} /> : null}

          {/* 144:2908: the boxes share one row. A secured card's fourth box makes two rows of two. */}
          <dl className={`grid gap-3 ${card.secured && card.depositMinCents > 0 ? "grid-cols-2" : "grid-cols-3"}`}>
            <FactChip className={FACT_BOX} label="Annual fee" value={moneyAmount(card.annualFeeCents)} />
            {card.secured && card.depositMinCents > 0 ? (
              <FactChip className={FACT_BOX} label="Deposit" value={`From ${moneyAmount(card.depositMinCents)}`} />
            ) : null}
            <FactChip className={FACT_BOX} label="Credit check" value={card.runsCreditCheck ? "Yes" : "No"} />
            <FactChip className={FACT_BOX} label="Foreign fee" value={`${card.foreignTransactionFeePercent}%`} />
          </dl>
          {/* What "secured" means for this card: the result frame's line (397:847), Inter 14/20 at 65%. */}
          {deposit ? <p className="-mt-3 text-body-s text-indigo-black/65">{deposit}</p> : null}

          <IssuerLooksFor rules={approval} />

          {/* The lesson link (144:2939): light blue tint, Amethyst text. Learn needs an account. */}
          {signedIn ? (
            <Link
              href={pennyPath(PREAPPROVAL_ANSWER, pennyFromCard(card.id, cardOrigin(from)))}
              className="rounded-[16px] bg-light-blue/50 px-4 py-3 text-body-s text-violet hover:bg-light-blue/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              New to this? What is preapproval? · 2 min
            </Link>
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

const REMINDER_STATUS: Record<ReminderStatus, string> = {
  on: "On",
  off: "Off",
  not_set: "Not set yet",
};

// The student's status for a card they track, with the way to change it
// (US-05). No frame yet: the box is the card page's white bordered box ("What
// the issuer looks for", 144:2936: 1.5px off-white border, radius 22, 20/16
// padding), with the status pill and Button/Secondary (79:9) as a text action. Mark result's back returns here. An
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
      {/* A quiet text action, not a full-width button: once the status is set it
          is a correction, not the next step (James, Oct 26). */}
      <Link
        href={applicationPath(application.id, "card")}
        className={cn(buttonVariants({ variant: "secondary" }), "-my-1 w-auto self-start px-0")}
      >
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
