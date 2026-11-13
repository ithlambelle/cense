import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import { FitSignal } from "@/components/ui/fit-signal";
import { SENSITIVE } from "@/lib/analytics";
import { bankSectionId, groupCardsByBank, type BankGroup } from "@/lib/cards/banks";
import type { Card } from "@/lib/cards/catalog";
import { cardDisplayName, cardTypeLabel, type FitTier } from "@/lib/copy/results";
import { moneyAmount } from "@/lib/money";
import { cardPath, quizPath, ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The card list (S13). No hi-fi frame yet: outlined cards in the style of the
// resource list (Figma 459:643) and the result's "Another option", proposed to
// design. Grouped by bank (Ben, Nov 10; order in lib/cards/banks.ts). Cards the
// rules can recommend come first in each bank and carry "Made for starting
// out", the old "Made for where most students start" group.
// A finished quiz: the match card's name and tier, or no name when no card fits.
export type YourMatch = { name: string | null; tier: FitTier };

export function CardListView({
  cards,
  signedIn,
  yourMatch = null,
  fromAccount = false,
}: {
  cards: Card[];
  signedIn: boolean;
  yourMatch?: YourMatch | null;
  // Opened from Profile (F6, Figma 477:2856): a back arrow returns there.
  // From the bottom bar, as a tab, it has none.
  fromAccount?: boolean;
}) {
  const header = !signedIn
    ? <AppHeader backHref={ROUTES.welcome} backLabel="Welcome" />
    : fromAccount
      ? <AppHeader backHref={ROUTES.settings} backLabel="Your account" />
      : null;
  const banks = groupCardsByBank(cards);

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        {header}
        <main className={cn("stagger flex flex-1 flex-col gap-6 px-6 pb-6", header ? "pt-4" : "pt-8")}>
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Cards</h1>
            <p className="text-body-m text-indigo-black">
              {yourMatch
                ? "Cards picked for students, by bank. Your match is on top."
                : "Cards picked for students, by bank. Take the quiz to see which one fits you, and why."}
            </p>
          </div>
          {yourMatch ? (
            <YourMatchRow match={yourMatch} />
          ) : (
            <Link href={quizPath("cards")} className={buttonVariants()}>
              Take the quiz
              <ButtonChevron />
            </Link>
          )}
          {signedIn ? null : (
            <Link
              href={signInPath(null)}
              className="-mt-3 min-h-11 content-center self-center text-body-s text-violet underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Sign in
            </Link>
          )}

          {cards.length === 0 ? (
            <section className="rounded-card bg-off-white p-5">
              <h2 className="font-heading text-h6 font-medium text-navy">Cards are on the way</h2>
              <p className="mt-1 text-body-s text-indigo-black">
                We’re checking each card’s details against what the issuer publishes. The list will show here when it’s
                ready.
              </p>
            </section>
          ) : (
            banks.map((group) => <BankSection key={group.bank} group={group} />)
          )}
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

function BankSection({ group }: { group: BankGroup }) {
  const id = bankSectionId(group.bank);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={id} className="font-heading text-h6 font-medium text-indigo-black">
            {group.bank}
          </h2>
          <span className="shrink-0 text-body-s text-indigo-black/70">
            {group.cards.length === 1 ? "1 card" : `${group.cards.length} cards`}
          </span>
        </div>
        {group.note ? <p className="text-body-s text-indigo-black">{group.note}</p> : null}
      </div>
      <ul className="flex flex-col gap-3">
        {group.cards.map((card) => (
          <li key={card.id}>
            <CardRow card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CardRow({ card }: { card: Card }) {
  return (
    <Link
      href={cardPath(card.id)}
      className="flex items-center gap-3 rounded-card border-[1.5px] border-violet bg-white p-5 hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-heading text-h6 font-medium text-navy">{cardDisplayName(card)}</span>
        <span className="text-body-s text-indigo-black">
          {cardTypeLabel(card)}, {moneyAmount(card.annualFeeCents)} annual fee
        </span>
        {card.catalogRole === "recommend" ? (
          <span className="mt-1 self-start rounded-pill bg-violet/15 px-2.5 py-[3px] text-body-s font-semibold text-violet-deep">
            Made for starting out
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
    </Link>
  );
}

// On top once the quiz is done, so the match is one tap away from the card
// list too. In interviews a student lost her result after leaving it, and was
// unsure whether the list or the quiz came first (2026-10-17).
function YourMatchRow({ match }: { match: YourMatch }) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={ROUTES.results}
        className="flex items-center gap-3 rounded-card bg-off-white p-5 transition-transform duration-200 motion-safe:active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body-s font-semibold text-violet">Your match</span>
          <span className={cn(SENSITIVE, "font-heading text-h6 font-medium text-navy")}>
            {match.name ?? "No card fits yet. See why"}
          </span>
        </span>
        {match.name ? (
          <FitSignal tier={match.tier} className={SENSITIVE} />
        ) : null}
        <ChevronRight aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
      </Link>
      <Link href={quizPath("cards")} className={buttonVariants({ variant: "secondary" })}>
        Retake quiz
      </Link>
    </div>
  );
}
