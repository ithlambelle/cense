"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { NoteLine } from "@/components/ui/note";
import { apiRequest, failureMessage, isUnauthorized, type ApiData } from "@/lib/api-client/client";
import {
  applyLabel,
  DID_YOU_APPLY,
  HAND_OFF_LINE,
  NO_PREAPPROVAL_LINE,
  PREAPPROVAL_LABEL,
  PREAPPROVAL_LINE,
  safeIssuerUrl,
} from "@/lib/copy/issuer";
import { cardPath, signInPath } from "@/lib/routes";

type Card = ApiData<"/cards/{id}", "get">;
type Kind = "preapproval" | "apply";

type Stage =
  | { name: "idle" }
  | { name: "opening"; kind: Kind }
  // The browser blocked the new tab, so the student is given a link to tap.
  | { name: "blocked"; kind: Kind; url: string }
  | { name: "asking" }
  | { name: "saving" }
  | { name: "saved" };

// The two buttons that hand a student to the issuer's own site. The click is
// saved first; the API answers with the address to open. Cense never submits
// an application.
type IssuerButtonsProps = {
  card: Card;
  // False when the screen already knows the visitor is signed out. Then a tap
  // goes straight to sign-in and no tab is opened.
  signedIn?: boolean;
};

export function IssuerButtons({ card, signedIn = true }: IssuerButtonsProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function openIssuer(kind: Kind) {
    setError(null);
    if (!signedIn) {
      router.push(signInPath(cardPath(card.id)));
      return;
    }
    setStage({ name: "opening", kind });
    // Safari only allows a new tab opened during the tap itself, so a blank
    // one is opened now and pointed at the issuer once the click is saved.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;

    const result = await apiRequest("post", "/issuer-clicks", { body: { cardId: card.id, kind } });
    if (!result.ok) {
      tab?.close();
      setStage({ name: "idle" });
      if (isUnauthorized(result)) {
        router.push(signInPath(cardPath(card.id)));
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
      body: { cardId: card.id, cardName: card.name, status: "applied", creditLimitCents: null },
    });
    // 409 means this card already has a record, which is the outcome wanted.
    if (result.ok || (result.kind === "api" && result.status === 409)) {
      setStage({ name: "saved" });
      return;
    }
    setStage({ name: "asking" });
    if (isUnauthorized(result)) {
      router.push(signInPath(cardPath(card.id)));
      return;
    }
    setError(failureMessage(result));
  }

  if (stage.name === "asking" || stage.name === "saving") {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-heading text-section font-semibold">{DID_YOU_APPLY}</p>
        <Button autoFocus pending={stage.name === "saving"} onClick={recordApplication}>
          Yes
        </Button>
        <Button
          variant="secondary"
          disabled={stage.name === "saving"}
          onClick={() => {
            setError(null);
            setStage({ name: "idle" });
          }}
        >
          Not yet
        </Button>
        {error ? (
          <p role="alert" className="text-label text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (stage.name === "saved") {
    return (
      <p role="status" className="text-body">
        Saved. This card now shows on Home.
      </p>
    );
  }

  const opening = stage.name === "opening" ? stage.kind : null;

  return (
    <div className="flex flex-col gap-3">
      {card.preapprovalUrl !== null ? (
        <>
          <Button
            aria-label={`${PREAPPROVAL_LABEL}: ${card.name}`}
            pending={opening === "preapproval"}
            disabled={opening === "apply"}
            onClick={() => openIssuer("preapproval")}
          >
            {PREAPPROVAL_LABEL}
          </Button>
          <NoteLine className="text-center">{PREAPPROVAL_LINE}</NoteLine>
        </>
      ) : (
        <NoteLine>{NO_PREAPPROVAL_LINE}</NoteLine>
      )}
      <Button
        aria-label={`${applyLabel(card.brand)}: ${card.name}`}
        variant={card.preapprovalUrl !== null ? "secondary" : "default"}
        pending={opening === "apply"}
        disabled={opening === "preapproval"}
        onClick={() => openIssuer("apply")}
      >
        {applyLabel(card.brand)}
      </Button>
      {card.referralDisclosure !== null ? <NoteLine>{card.referralDisclosure}</NoteLine> : null}
      {stage.name === "blocked" ? (
        <a
          href={stage.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "link", className: "self-center" })}
          onClick={() => setStage(stage.kind === "apply" ? { name: "asking" } : { name: "idle" })}
        >
          The new tab didn’t open. Open {card.brand}’s site.
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="text-label text-destructive">
          {error}
        </p>
      ) : null}
      <NoteLine>{HAND_OFF_LINE}</NoteLine>
    </div>
  );
}
