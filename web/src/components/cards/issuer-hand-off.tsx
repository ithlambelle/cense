"use client";

// Created with Claude Code (2026-11-18). The hand-off to a card issuer, shared
// by the card page (IssuerActions) and the top match on Your match
// (TopMatchActions, Figma 821:9205): the click is saved first, the API answers
// with the address to open, and after Apply the student is asked "Did you
// finish applying?" when they come back. Cense never submits an application.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Button, ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { track } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { DID_YOU_APPLY, safeIssuerUrl } from "@/lib/copy/issuer";
import { cardDisplayName } from "@/lib/copy/results";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

export type IssuerKind = "preapproval" | "apply";

export type HandOffStage =
  | { name: "idle" }
  // The card page's sheet, which says what happens next before the student leaves.
  | { name: "sheet"; kind: IssuerKind }
  | { name: "opening"; kind: IssuerKind }
  // The browser blocked the new tab, so the student is given a link to tap.
  | { name: "blocked"; kind: IssuerKind; url: string }
  | { name: "asking" }
  | { name: "saving" }
  | { name: "saved" }
  | { name: "already" };

// Survives a reload while the student is on the issuer's site, so "Did you
// finish applying?" is still asked when they come back. Per tab only
// (sessionStorage), and only a card id is stored. The card page and Your
// match share the key, so an answer in either place clears it for both.
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

type HandOffCard = { id: string; brand: string; name: string };

export type IssuerHandOff = ReturnType<typeof useIssuerHandOff>;

// `signInReturn`: where a student whose session ran out comes back to after
// signing in (the card page, or Your match).
export function useIssuerHandOff(card: HandOffCard, signInReturn: string) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [chosenStage, setChosenStage] = useState<HandOffStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ask again after a reload if the student left for the application. Read
  // from storage after hydration (the server always renders the buttons); it
  // applies until the student does anything.
  const restored = useSyncExternalStore(noSubscription, () => isWaiting(card.id), () => false);
  const stage: HandOffStage = chosenStage ?? (restored ? { name: "asking" } : { name: "idle" });
  const setStage = (next: HandOffStage) => setChosenStage(next);

  // Must run inside the student's tap: Safari only allows a new tab opened
  // during the tap itself, so a blank one is opened now and pointed at the
  // issuer once the click is saved.
  async function openIssuer(kind: IssuerKind) {
    setError(null);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setStage({ name: "opening", kind });
    const result = await apiRequest("post", "/issuer-clicks", { body: { cardId: card.id, kind } });
    if (!result.ok) {
      tab?.close();
      setStage({ name: "idle" });
      if (isUnauthorized(result)) {
        if (isMounted()) router.push(signInPath(signInReturn));
        return;
      }
      setError(failureMessage(result));
      return;
    }
    // A copy of the issuer_clicks row the API just saved (S46): its id is the
    // event id, so PostHog can be checked against Postgres. No id: the click
    // was not recorded, so there is nothing to copy, and the issuer opens anyway.
    if (result.data.id && result.data.clickedAt) {
      track(
        "issuer_link_clicked",
        { click_id: result.data.id, card_id: card.id, link_type: kind },
        { uuid: result.data.id, timestamp: new Date(result.data.clickedAt) },
      );
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
      // Only once the application is saved: a retry after a failed save, or a
      // card that was already tracked (409 below), is not a second report.
      track("outcome_reported", { outcome: "applied", source: "did_you_apply" });
      rememberWaiting(card.id, false);
      setStage({ name: "saved" });
      router.refresh();
      return;
    }
    // 409: this card is already tracked (applied or approved). Nothing new is
    // saved. The card limit is also a 409; its message is shown below.
    if (result.kind === "api" && result.status === 409 && result.code !== "limit_reached") {
      rememberWaiting(card.id, false);
      setStage({ name: "already" });
      return;
    }
    setStage({ name: "asking" });
    if (isUnauthorized(result)) {
      if (isMounted()) router.push(signInPath(signInReturn));
      return;
    }
    setError(failureMessage(result));
  }

  function notYet() {
    track("outcome_reported", { outcome: "didnt_apply", source: "did_you_apply" });
    rememberWaiting(card.id, false);
    setError(null);
    setStage({ name: "idle" });
  }

  return { card, stage, setStage, error, setError, openIssuer, recordApplication, notYet };
}

// "Did you finish applying?", shown in place of the buttons after Apply.
export function DidYouApply({ handOff, className }: { handOff: IssuerHandOff; className?: string }) {
  const { stage, error } = handOff;
  return (
    <section
      aria-labelledby="did-you-apply"
      className={cn("flex flex-col gap-3 rounded-card border border-hairline p-5", className)}
    >
      <h2 id="did-you-apply" className="font-heading text-h5 font-medium text-navy">
        {DID_YOU_APPLY}
      </h2>
      <p className="text-body-s text-indigo-black">
        We can mark this card as applied on Home. Cense can’t see or check what happened on the issuer’s site, and you
        can update it later.
      </p>
      <Button autoFocus pending={stage.name === "saving"} onClick={handOff.recordApplication}>
        Yes, I finished
      </Button>
      <Button variant="secondary" disabled={stage.name === "saving"} onClick={handOff.notYet}>
        Not yet
      </Button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </section>
  );
}

// After Yes: saved, or the card was already on Home.
export function HandOffDone({ stage, className }: { stage: { name: "saved" | "already" }; className?: string }) {
  return (
    <section role="status" className={cn("flex flex-col gap-3 rounded-card bg-off-white p-5", className)}>
      <p className="text-body-m text-navy">
        {stage.name === "saved"
          ? "Saved as applied. When you hear back, update it on Home."
          : "This card is already on Home, so nothing new was saved."}
      </p>
      <Link href={ROUTES.home} className={buttonVariants()}>
        Go to Home
        <ButtonChevron />
      </Link>
    </section>
  );
}

// The browser blocked the new tab: a link to tap instead, opened the same safe way.
export function BlockedTabLink({ handOff }: { handOff: IssuerHandOff }) {
  const { stage } = handOff;
  if (stage.name !== "blocked") return null;
  return (
    <a
      href={stage.url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "link", className: "self-center" })}
      onClick={() => handOff.setStage(stage.kind === "apply" ? { name: "asking" } : { name: "idle" })}
    >
      The new tab didn’t open. Open {handOff.card.brand}’s site.
    </a>
  );
}
