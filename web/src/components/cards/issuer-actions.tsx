"use client";

import ArrowUpRightFromSquare from "@gravity-ui/icons/ArrowUpRightFromSquare";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { NoteLine } from "@/components/ui/note";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest, failureMessage, isUnauthorized, type ApiData } from "@/lib/api-client/client";
import {
  applyLabel,
  DID_YOU_APPLY,
  HAND_OFF_LINE,
  PREAPPROVAL_LABEL,
  PREAPPROVAL_LINE,
  safeIssuerUrl,
} from "@/lib/copy/issuer";
import { cardDisplayName } from "@/lib/copy/results";
import { cardPath, ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// Only the fields this client component reads, so the rest of the catalog
// entry (such as its evidence links) is never sent to the browser.
export type IssuerCard = Pick<
  ApiData<"/cards/{id}", "get">,
  "id" | "brand" | "name" | "preapprovalUrl" | "referralDisclosure"
>;
type Kind = "preapproval" | "apply";

type Stage =
  | { name: "idle" }
  | { name: "sheet"; kind: Kind }
  | { name: "opening"; kind: Kind }
  // The browser blocked the new tab, so the student is given a link to tap.
  | { name: "blocked"; kind: Kind; url: string }
  | { name: "asking" }
  | { name: "saving" }
  | { name: "saved" }
  | { name: "already" };

// Survives a reload of the card page while the student is on the issuer's
// site, so "Did you finish applying?" is still asked when they come back.
// Per tab only (sessionStorage), and only a card id is stored.
function waitingKey(cardId: string): string {
  return `cense:did-you-apply:${cardId}`;
}

function rememberWaiting(cardId: string, waiting: boolean) {
  try {
    if (waiting) sessionStorage.setItem(waitingKey(cardId), "1");
    else sessionStorage.removeItem(waitingKey(cardId));
  } catch {
    // Storage can be off (private mode); the question then lasts this page view.
  }
}

function noSubscription() {
  return () => undefined;
}

function isWaiting(cardId: string): boolean {
  try {
    return sessionStorage.getItem(waitingKey(cardId)) === "1";
  } catch {
    return false;
  }
}

type IssuerActionsProps = {
  card: IssuerCard;
  // The card's notes from the fit tier rules (cardNotes), worked out on the server.
  notes: string[];
  // False when the page knows the visitor is signed out. Then a tap goes
  // straight to sign-in, returning to this card.
  signedIn: boolean;
};

// Check preapproval and Apply, each through a sheet that says what happens
// next before the student leaves Cense (lo-fi 219:909, screens 02 and 04).
// The click is saved first; the API answers with the address to open. Cense
// never submits an application.
export function IssuerActions({ card, notes, signedIn }: IssuerActionsProps) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [chosenStage, setChosenStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ask again after a reload if the student left for the application. Read
  // from storage after hydration (the server always renders the buttons); it
  // applies until the student does anything.
  const restored = useSyncExternalStore(noSubscription, () => isWaiting(card.id), () => false);
  const stage: Stage = chosenStage ?? (restored ? { name: "asking" } : { name: "idle" });
  const setStage = (next: Stage) => setChosenStage(next);

  function start(kind: Kind) {
    setError(null);
    if (!signedIn) {
      router.push(signInPath(cardPath(card.id)));
      return;
    }
    setStage({ name: "sheet", kind });
  }

  // Runs inside the tap on the sheet's confirm button: Safari only allows a
  // new tab opened during the tap itself, so a blank one is opened now and
  // pointed at the issuer once the click is saved.
  async function openIssuer(kind: Kind) {
    setError(null);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setStage({ name: "opening", kind });
    const result = await apiRequest("post", "/issuer-clicks", { body: { cardId: card.id, kind } });
    if (!result.ok) {
      tab?.close();
      setStage({ name: "idle" });
      if (isUnauthorized(result)) {
        if (isMounted()) router.push(signInPath(cardPath(card.id)));
        return;
      }
      setError(failureMessage(result));
      return;
    }
    const url = safeIssuerUrl(result.data.url);
    if (!url) {
      tab?.close();
      setStage({ name: "idle" });
      setError("We couldn’t open the issuer’s site. Please try again later.");
      return;
    }
    if (kind === "apply") rememberWaiting(card.id, true);
    // No tab (blocked), or the student closed it while the click was saving.
    if (!tab || tab.closed) {
      setStage({ name: "blocked", kind, url });
      return;
    }
    tab.location.replace(url);
    setStage(kind === "apply" ? { name: "asking" } : { name: "idle" });
  }

  async function recordApplication() {
    setError(null);
    setStage({ name: "saving" });
    const result = await apiRequest("post", "/applications", {
      body: { cardId: card.id, cardName: cardDisplayName(card), status: "applied", creditLimitCents: null },
    });
    if (result.ok) {
      rememberWaiting(card.id, false);
      setStage({ name: "saved" });
      router.refresh();
      return;
    }
    // 409: this card is already tracked (applied or approved). Nothing new is saved.
    if (result.kind === "api" && result.status === 409) {
      rememberWaiting(card.id, false);
      setStage({ name: "already" });
      return;
    }
    setStage({ name: "asking" });
    if (isUnauthorized(result)) {
      if (isMounted()) router.push(signInPath(cardPath(card.id)));
      return;
    }
    setError(failureMessage(result));
  }

  if (stage.name === "asking" || stage.name === "saving") {
    return (
      <section aria-labelledby="did-you-apply" className="flex flex-col gap-3 rounded-card border border-hairline p-5">
        <h2 id="did-you-apply" className="font-heading text-h5 font-medium text-navy">
          {DID_YOU_APPLY}
        </h2>
        <p className="text-body-s text-indigo-black">
          We can mark this card as applied on Home. Cense can’t see or check what happened on the issuer’s site, and you
          can update it later.
        </p>
        <Button autoFocus pending={stage.name === "saving"} onClick={recordApplication}>
          Yes, I finished
        </Button>
        <Button
          variant="secondary"
          disabled={stage.name === "saving"}
          onClick={() => {
            rememberWaiting(card.id, false);
            setError(null);
            setStage({ name: "idle" });
          }}
        >
          Not yet
        </Button>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </section>
    );
  }

  if (stage.name === "saved" || stage.name === "already") {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-card bg-off-white p-5">
        <p className="text-body-m text-navy">
          {stage.name === "saved"
            ? "Saved as applied. When you hear back, update it on Home."
            : "This card is already on Home, so nothing new was saved."}
        </p>
        <Link href={ROUTES.home} className={buttonVariants()}>
          Go to Home
        </Link>
      </section>
    );
  }

  const opening = stage.name === "opening" ? stage.kind : null;
  const sheetKind = stage.name === "sheet" || stage.name === "opening" ? stage.kind : null;

  return (
    <div className="flex flex-col gap-3">
      {card.preapprovalUrl !== null ? (
        <>
          <Button aria-label={`${PREAPPROVAL_LABEL}: ${cardDisplayName(card)}`} onClick={() => start("preapproval")}>
            {PREAPPROVAL_LABEL}
          </Button>
          <NoteLine className="text-center">{PREAPPROVAL_LINE}</NoteLine>
        </>
      ) : null}
      {notes.map((note) => (
        <NoteLine key={note}>{note}</NoteLine>
      ))}
      <Button
        aria-label={`${applyLabel(card.brand)}: ${cardDisplayName(card)}`}
        variant={card.preapprovalUrl !== null ? "secondary" : "default"}
        onClick={() => start("apply")}
      >
        {applyLabel(card.brand)}
      </Button>
      {stage.name === "blocked" ? (
        <a
          href={stage.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "link", className: "self-center text-violet" })}
          onClick={() => setStage(stage.kind === "apply" ? { name: "asking" } : { name: "idle" })}
        >
          The new tab didn’t open. Open {card.brand}’s site.
        </a>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <NoteLine>{HAND_OFF_LINE}</NoteLine>

      <Sheet
        open={sheetKind === "preapproval"}
        onOpenChange={(open) => {
          if (!open && opening === null) setStage({ name: "idle" });
        }}
        title="Check first, then decide"
        description={`See whether ${card.brand} preapproves you before you choose to apply.`}
      >
        <div className="rounded-card bg-off-white p-4">
          <p className="font-heading text-h6 font-medium text-navy">{PREAPPROVAL_LINE}</p>
          <p className="mt-1 text-body-s text-indigo-black">
            A preapproval is not a final decision. A full application may still include a credit check.
          </p>
        </div>
        <WhatHappensNext brand={card.brand} form="preapproval form" />
        <Button pending={opening === "preapproval"} onClick={() => openIssuer("preapproval")}>
          Go to preapproval check
          <ArrowUpRightFromSquare aria-hidden="true" width={18} height={18} />
        </Button>
        <NoteLine className="text-center">Opens {card.brand}’s site in a new tab.</NoteLine>
      </Sheet>

      <Sheet
        open={sheetKind === "apply"}
        onOpenChange={(open) => {
          if (!open && opening === null) setStage({ name: "idle" });
        }}
        title="Apply on the issuer’s site"
        description={`Your application opens in a new tab and is completed with ${card.brand}.`}
      >
        <div className="rounded-card bg-off-white p-4">
          <p className="font-heading text-h6 font-medium text-navy">You stay in control</p>
          <p className="mt-1 text-body-s text-indigo-black">
            Cense doesn’t fill in or submit your application. Review the issuer’s terms before you submit.
          </p>
        </div>
        {card.referralDisclosure !== null ? <NoteLine>{card.referralDisclosure}</NoteLine> : null}
        <WhatHappensNext brand={card.brand} form="application" />
        <Button pending={opening === "apply"} onClick={() => openIssuer("apply")}>
          Open {card.brand} application
          <ArrowUpRightFromSquare aria-hidden="true" width={18} height={18} />
        </Button>
        <Button variant="secondary" disabled={opening === "apply"} onClick={() => setStage({ name: "idle" })}>
          Not ready yet
        </Button>
      </Sheet>
    </div>
  );
}

// The three ordered steps from the lo-fi hand-off screen.
function WhatHappensNext({ brand, form }: { brand: string; form: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-heading text-h6 font-medium text-navy">What happens next</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-s text-indigo-black marker:text-violet">
        <li>{brand}’s site opens in a new tab.</li>
        <li>You fill in their {form} there.</li>
        <li>Come back to Cense to keep going.</li>
      </ol>
    </div>
  );
}
