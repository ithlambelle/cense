import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import type { Card } from "@/lib/cards/catalog";
import { cardDisplayName, cardTypeLabel } from "@/lib/copy/results";
import { moneyAmount } from "@/lib/money";
import { cardPath, ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The card list (S13). No hi-fi frame yet: outlined cards in the style of the
// resource list (Figma 459:643) and the result's "Another option", proposed to
// design. Cards the rules can recommend come first.
export function CardListView({ cards, signedIn }: { cards: Card[]; signedIn: boolean }) {
  const recommend = cards.filter((card) => card.catalogRole === "recommend");
  const explore = cards.filter((card) => card.catalogRole === "explore");

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
            <>
              <CardGroup title="Made for where most students start" cards={recommend} />
              <CardGroup title="More cards to explore" cards={explore} />
            </>
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

function CardGroup({ title, cards }: { title: string; cards: Card[] }) {
  if (cards.length === 0) return null;
  const id = title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-h6 font-medium text-indigo-black">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={cardPath(card.id)}
              className="flex items-center gap-3 rounded-card border-[1.5px] border-violet bg-white p-5 outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
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
