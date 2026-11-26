"use client";

// Created with Claude Code (2026-11-26). "Remove this card" and its
// confirmation sheet, for a card the student added themselves. No frame draws
// it: the sheet follows Disconnect your bank (Figma E3, 709:1664): a title,
// what is removed in at most three lines, the action, then "Keep it".
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Sheet } from "@/components/ui/sheet";
import { SENSITIVE } from "@/lib/analytics";
import { removeCard } from "@/lib/api-client/applications";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// The Design System's Text button (371:2836), as the card page draws it.
const TEXT_ACTION =
  "inline-flex min-h-11 items-center self-start rounded-pill px-3 text-button-s font-semibold text-violet hover:bg-violet/10 active:bg-violet/10 active:text-violet/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function RemoveCard({ applicationId, cardName, signInNext }: { applicationId: string; cardName: string; signInNext: string }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await removeCard(applicationId);
    if (!isMounted()) return;
    if (result.kind === "ok") {
      // Replaced, so Back never returns to a card that is gone.
      router.replace(ROUTES.home);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(signInNext));
      return;
    }
    setError(result.message);
  }

  return (
    <>
      <button type="button" className={`-mx-3 ${TEXT_ACTION}`} onClick={() => setOpen(true)}>
        Remove this card
      </button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setError(null);
          setOpen(next);
        }}
        title="Remove this card?"
        titleClassName="text-h4 font-semibold"
      >
        <ul className={`${SENSITIVE} -mt-1 flex flex-col gap-3 text-body-s text-indigo-black`}>
          <li className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>We remove {cardName} from Cense, with its reminders and setup steps.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>Your card stays open at your bank. Nothing changes there.</span>
          </li>
        </ul>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <Button type="button" pending={pending} onClick={remove}>
          Remove card
        </Button>
        <Button type="button" variant="secondary" className="-mt-1 h-9 w-auto self-start px-3" disabled={pending} onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </Sheet>
    </>
  );
}
