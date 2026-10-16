"use client";

import Link from "next/link";

import { CardSummary } from "@/components/cards/card-summary";
import { IssuerButtons } from "@/components/cards/issuer-buttons";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { ScreenShell } from "@/components/ui/screen-shell";
import { apiRequest, failureMessage, type ApiData } from "@/lib/api-client/client";
import { readSignedIn } from "@/lib/api-client/session";
import { cardPath, ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

type CardList = {
  // Null while the catalog has no reviewed cards (the API answers 503).
  cards: ApiData<"/cards", "get">["cards"] | null;
  // Null when it could not be read. Then nothing is assumed either way.
  signedIn: boolean | null;
};

async function loadCards(): Promise<LoadOutcome<CardList>> {
  // The list is public, so being signed out is not a failure.
  const [cards, signedIn] = await Promise.all([apiRequest("get", "/cards"), readSignedIn()]);
  if (cards.ok) return { status: "ready", data: { cards: cards.data.cards, signedIn } };
  if (cards.kind === "api" && cards.code === "catalog_unavailable") {
    return { status: "ready", data: { cards: null, signedIn } };
  }
  return { status: "failed", message: failureMessage(cards) };
}

export function CardsFlow() {
  const { loaded, retry } = useLoaded(loadCards, ROUTES.signIn);

  if (loaded.status === "loading") return <LoadingScreen label="Loading cards" />;
  if (loaded.status === "failed") {
    return <FailedScreen title="We couldn’t load the cards" message={loaded.message} onRetry={retry} offerCards={false} />;
  }

  const { cards, signedIn } = loaded.data;

  return (
    <ScreenShell
      nav={signedIn ? <BottomNav /> : undefined}
      footer={
        <>
          <Link href={ROUTES.quiz} className={buttonVariants()}>
            Take the quiz
          </Link>
          {signedIn !== false ? null : (
            <Link href={signInPath(null)} className={buttonVariants({ variant: "link", className: "self-center" })}>
              Sign in
            </Link>
          )}
        </>
      }
    >
      <h1 className="font-heading text-title font-bold">Find your first credit card</h1>
      <p className="mt-2 text-label text-muted-foreground">
        Six short questions, then a card to start with and the reason for it. Guidance, not a guarantee.
      </p>
      {cards === null ? (
        <div className="mt-8 rounded-card border-[1.5px] border-track p-5">
          <h2 className="font-heading text-section font-semibold">Cards are on the way</h2>
          <p className="mt-1 text-label text-muted-foreground">
            We’re checking each card’s details against what the issuer publishes. The list will show here when it’s ready.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-4 rounded-card border-[1.5px] border-primary p-5">
              <CardSummary card={card} />
              <Link
                href={cardPath(card.id)}
                aria-label={`See details: ${card.name}`}
                className={buttonVariants({ variant: "link", className: "self-start" })}
              >
                See details
              </Link>
              <IssuerButtons card={card} signedIn={signedIn !== false} />
            </li>
          ))}
        </ul>
      )}
    </ScreenShell>
  );
}
