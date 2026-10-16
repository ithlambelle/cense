"use client";

import { useCallback } from "react";

import { CardSummary } from "@/components/cards/card-summary";
import { IssuerButtons } from "@/components/cards/issuer-buttons";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { BackLink } from "@/components/ui/back-link";
import { GlowCard } from "@/components/ui/glow-card";
import { NoteLine } from "@/components/ui/note";
import { ScreenShell } from "@/components/ui/screen-shell";
import { apiRequest, failureMessage, type ApiData } from "@/lib/api-client/client";
import { readSignedIn } from "@/lib/api-client/session";
import { ROUTES } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

type Detail = {
  // Null when there is no such card, or the catalog is not ready.
  card: ApiData<"/cards/{id}", "get"> | null;
  signedIn: boolean | null;
};

async function loadCard(cardId: string): Promise<LoadOutcome<Detail>> {
  const [result, signedIn] = await Promise.all([
    apiRequest("get", "/cards/{id}", { pathParams: { id: cardId } }),
    readSignedIn(),
  ]);
  if (result.ok) return { status: "ready", data: { card: result.data, signedIn } };
  if (result.kind === "api" && (result.status === 404 || result.code === "catalog_unavailable")) {
    return { status: "ready", data: { card: null, signedIn } };
  }
  return { status: "failed", message: failureMessage(result) };
}

export function CardDetailFlow({ cardId }: { cardId: string }) {
  const load = useCallback(() => loadCard(cardId), [cardId]);
  const { loaded, retry } = useLoaded(load, ROUTES.signIn);

  if (loaded.status === "loading") return <LoadingScreen label="Loading this card" />;
  if (loaded.status === "failed") {
    return <FailedScreen title="We couldn’t load this card" message={loaded.message} onRetry={retry} />;
  }

  const { card, signedIn } = loaded.data;

  return (
    <ScreenShell>
      <BackLink href={ROUTES.cards} />
      {card === null ? (
        <>
          <h1 className="mt-3 font-heading text-title font-bold">This card isn’t available</h1>
          <p className="mt-2 text-body text-muted-foreground">It may have been removed, or the card list is still on the way.</p>
        </>
      ) : (
        <GlowCard purpose="result" className="mt-4">
          <CardSummary card={card} as="h1" />
          {card.conditions
            .filter((condition) => condition.affects === "approval")
            .map((condition) => (
              <NoteLine key={condition.kind}>{condition.text}</NoteLine>
            ))}
          <IssuerButtons card={card} signedIn={signedIn !== false} />
        </GlowCard>
      )}
    </ScreenShell>
  );
}
