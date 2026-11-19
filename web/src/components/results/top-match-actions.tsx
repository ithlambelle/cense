"use client";

// Created with Claude Code (2026-11-18). M1 "Your match" with actions (Figma
// gPofkJWVZ2wUWyF9SfHW6O, 821:9205, Flow 3 on Approved [Not live]): the top
// match carries "Check if you're preapproved" (the design system's Primary
// button) and "Apply at {issuer}" (Secondary, 371:2821), preapproval first as
// on the card page. Ben, on the frame's change card: Apply belongs here, and a
// card with no preapproval check (13 of 53, such as Chime) shows Apply alone,
// as the primary. Either tap goes straight to the issuer in a new tab (the
// frame's flow: "Taps either button", then the issuer's page opens and Cense
// logs the click); the card page's explaining sheet is not on this screen.
// The click is saved and copied to analytics exactly as on the card page
// (issuer-hand-off.tsx).

import { BlockedTabLink, DidYouApply, HandOffDone, useIssuerHandOff } from "@/components/cards/issuer-hand-off";
import { SeeDetailsLink } from "@/components/results/see-details-link";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { applyAtLabel, PREAPPROVAL_LABEL } from "@/lib/copy/issuer";
import { cardDisplayName } from "@/lib/copy/results";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// The frame's buttons are 56 tall on one line. A long label ("Check if
// you're preapproved", "Apply at American Express") wraps onto a second line
// on a narrow phone instead of running out of the button.
const WRAPS = "h-auto min-h-14 py-2 whitespace-normal";
// Primary (371:2817): label left, white, chevron right, 20/18 insets.
const PRIMARY = cn(WRAPS, "text-left");
// Secondary (371:2821): white, 1.5px Amethyst border, Amethyst label at 17,
// centered, 20/18 insets; pressed is the 15% Amethyst tint (371:2843).
const SECONDARY = cn(WRAPS, "pr-4.5 pl-5 text-center text-button text-violet active:bg-violet/15");

type TopMatchActionsProps = {
  // Only the fields this client component reads.
  card: { id: string; brand: string; name: string };
  // The catalog has a preapproval check for this card.
  hasPreapproval: boolean;
  // The student already tracks this card (any status), so it shows "See
  // details" like the other options: its page shows the status, and no
  // preapproval check or apply hand-off is offered again (as on the card page).
  tracked: boolean;
  // The card page, opened from Your match.
  detailsHref: string;
};

export function TopMatchActions({ card, hasPreapproval, tracked, detailsHref }: TopMatchActionsProps) {
  const handOff = useIssuerHandOff(card, ROUTES.results);
  const { stage, error, openIssuer } = handOff;
  const name = cardDisplayName(card);

  // Raised over the card's stretched link (z-1) so a tap here never opens the card page.
  if (stage.name === "asking" || stage.name === "saving") {
    // The card is the box, so the question has none of its own.
    return <DidYouApply handOff={handOff} className="relative z-1 rounded-none border-0 p-0" />;
  }

  if (stage.name === "saved" || stage.name === "already") {
    return <HandOffDone stage={stage} className="relative z-1 rounded-none bg-transparent p-0" />;
  }

  if (tracked) return <SeeDetailsLink href={detailsHref} cardName={name} />;

  const opening = stage.name === "opening" ? stage.kind : null;
  return (
    <div className="relative z-1 flex flex-col gap-2.5">
      {hasPreapproval ? (
        <Button
          aria-label={`${PREAPPROVAL_LABEL}: ${name}`}
          className={PRIMARY}
          pending={opening === "preapproval"}
          disabled={opening === "apply"}
          onClick={() => openIssuer("preapproval")}
        >
          {PREAPPROVAL_LABEL}
        </Button>
      ) : null}
      <Button
        aria-label={`${applyAtLabel(card.brand)}: ${name}`}
        variant={hasPreapproval ? "outline" : "default"}
        className={hasPreapproval ? SECONDARY : PRIMARY}
        pending={opening === "apply"}
        disabled={opening === "preapproval"}
        onClick={() => openIssuer("apply")}
      >
        {applyAtLabel(card.brand)}
      </Button>
      <BlockedTabLink handOff={handOff} />
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
