"use client";

import ArrowUpRightFromSquare from "@gravity-ui/icons/ArrowUpRightFromSquare";
import { useRouter } from "next/navigation";

import {
  BlockedTabLink,
  DidYouApply,
  HandOffDone,
  type IssuerKind,
  useIssuerHandOff,
} from "@/components/cards/issuer-hand-off";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { NoteLine } from "@/components/ui/note";
import { Sheet } from "@/components/ui/sheet";
import type { ApiData } from "@/lib/api-client/client";
import { applyLabel, HAND_OFF_LINE, PREAPPROVAL_LABEL, PREAPPROVAL_LINE } from "@/lib/copy/issuer";
import { cardDisplayName } from "@/lib/copy/results";
import { cardPath, signInPath } from "@/lib/routes";

// Only the fields this client component reads, so the rest of the catalog
// entry (such as its evidence links) is never sent to the browser.
type IssuerCard = Pick<
  ApiData<"/cards/{id}", "get">,
  "id" | "brand" | "name" | "preapprovalUrl" | "referralDisclosure"
>;

type IssuerActionsProps = {
  card: IssuerCard;
  // The card's notes from the fit tier rules (cardNotes), worked out on the server.
  notes: string[];
  // False when the page knows the visitor is signed out. Then a tap goes
  // straight to sign-in, returning to this card.
  signedIn: boolean;
  // The signed-in student already tracks this card (any status).
  tracked?: boolean;
};

// Check preapproval and Apply, each through a sheet that says what happens
// next before the student leaves Cense (lo-fi 219:909, screens 02 and 04).
// The click is saved first; the API answers with the address to open. Cense
// never submits an application. The hand-off itself (issuer-hand-off.tsx) is
// shared with the top match on Your match.
export function IssuerActions({ card, notes, signedIn, tracked = false }: IssuerActionsProps) {
  const router = useRouter();
  const handOff = useIssuerHandOff(card, cardPath(card.id));
  const { stage, setStage, error, setError, openIssuer } = handOff;

  function start(kind: IssuerKind) {
    setError(null);
    if (!signedIn) {
      router.push(signInPath(cardPath(card.id)));
      return;
    }
    setStage({ name: "sheet", kind });
  }

  if (stage.name === "asking" || stage.name === "saving") return <DidYouApply handOff={handOff} />;

  if (stage.name === "saved" || stage.name === "already") return <HandOffDone stage={stage} />;

  const opening = stage.name === "opening" ? stage.kind : null;
  const sheetKind = stage.name === "sheet" || stage.name === "opening" ? stage.kind : null;

  // A card the student already tracks shows its status on the page instead:
  // no preapproval check or apply hand-off for a card they applied for, got,
  // or were denied. The question and confirmation above still show, so
  // "Saved as applied" stays after the save makes the card tracked.
  if (tracked) return null;

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
      <BlockedTabLink handOff={handOff} />
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
        <Button chevron={false} pending={opening === "preapproval"} onClick={() => openIssuer("preapproval")}>
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
        <Button chevron={false} pending={opening === "apply"} onClick={() => openIssuer("apply")}>
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
