import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

import { IssuerBadge } from "@/components/cards/issuer-badge";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import type { Card } from "@/lib/cards/catalog";
import { groupByIssuer } from "@/lib/cards/issuers";
import { cardDisplayName, cardTypeLabel } from "@/lib/copy/results";
import { moneyAmount } from "@/lib/money";
import { cardPath, ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The card list (S13). No hi-fi frame yet: outlined cards in the style of the
// resource list (Figma 459:643) and the result's "Another option", proposed to
// design. Grouped by issuer; in each, cards the rules can recommend come first
// and are marked as a good place to start.
export function CardListView({ cards, signedIn }: { cards: Card[]; signedIn: boolean }) {

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        {signedIn ? null : <AppHeader backHref={ROUTES.welcome} title="Cards" />}
        <main className={cn("stagger flex flex-1 flex-col gap-6 px-6 pb-6", signedIn ? "pt-8" : "pt-4")}>
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Cards</h1>
            <p className="text-body-m text-indigo-black">
              Cards picked for students. Take the quiz to see which one fits you, and why.
            </p>
          </div>
          <Link href={ROUTES.quiz} className={buttonVariants()}>
            Take the quiz
          </Link>
          {signedIn ? null : (
            <Link
              href={signInPath(null)}
              className="-mt-3 min-h-11 content-center self-center text-body-s text-violet underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
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
            groupByIssuer(cards).map((group) => <IssuerGroup key={group.brand} brand={group.brand} cards={group.cards} />)
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

function IssuerGroup({ brand, cards }: { brand: string; cards: Card[] }) {
  const id = `issuer-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <IssuerBadge brand={brand} />
        <h2 id={id} className="flex-1 font-heading text-h5 font-medium text-navy">
          {brand}
        </h2>
        <span className="text-body-s text-indigo-black/70">
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={cardPath(card.id)}
              className="flex items-center gap-3 rounded-card border-[1.5px] border-violet bg-white p-5 outline-none transition-[background-color,scale] duration-200 hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[0.98]"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {card.catalogRole === "recommend" ? (
                  <span className="self-start rounded-pill bg-off-white px-2.5 py-0.5 text-caption font-semibold text-violet-deep">
                    Good place to start
                  </span>
                ) : null}
                <span className="font-heading text-h6 font-medium text-navy">{cardDisplayName(card)}</span>
                <span className="text-body-s text-indigo-black">
                  {cardTypeLabel(card)}, {moneyAmount(card.annualFeeCents)} annual fee
                </span>
              </span>
              <ChevronRight aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
