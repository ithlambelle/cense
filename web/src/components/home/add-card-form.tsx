"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { limitToCents } from "@/components/applications/mark-result";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE, track } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

type AddCardFormProps = {
  onAdded: () => void;
  onCancel: () => void;
  onSignedOut: () => void;
};

// For a student who already has a card. Its credit limit is optional.
function AddCardForm({ onAdded, onCancel, onSignedOut }: AddCardFormProps) {
  const isMounted = useIsMounted();
  const [cardName, setCardName] = useState("");
  const [limit, setLimit] = useState("");
  const [limitError, setLimitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setLimitError(null);
    if (cardName.trim() === "") {
      setError("Enter the card’s name.");
      return;
    }
    const creditLimitCents = limitToCents(limit);
    if (creditLimitCents === undefined) {
      setLimitError("Enter the limit in dollars, like 500 or 1,500.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiRequest("post", "/applications", {
      body: { cardId: null, cardName: cardName.trim(), status: "approved", creditLimitCents },
    });
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (result.ok) {
      // Never the card name the student typed.
      track("card_added", { method: "manual" });
      onAdded();
      return;
    }
    setPending(false);
    if (isUnauthorized(result)) {
      onSignedOut();
      return;
    }
    if (result.kind === "network") {
      // The card may have been saved even though no answer came back.
      setError("We couldn’t confirm that. Go back and check your cards before adding it again.");
      return;
    }
    setError(result.kind === "api" && result.code === "invalid_request" ? "Enter the card’s name." : failureMessage(result));
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-1 flex-col gap-4" noValidate>
      <TextField
        label="Card name"
        name="cardName"
        placeholder="For example, Student Cash Card"
        maxLength={160}
        autoComplete="off"
        value={cardName}
        onChange={(event) => setCardName(event.target.value)}
        error={error ?? undefined}
        disabled={pending}
      />
      <div className={SENSITIVE}>
        <TextField
          label="Credit limit (optional)"
          name="creditLimit"
          hint="Find it in your issuer’s app. Leave it blank if you don’t know yet."
          inputMode="decimal"
          autoComplete="off"
          placeholder="$500"
          maxLength={32}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={limitError ?? undefined}
          disabled={pending}
        />
      </div>
      {/* The frame's spacer: the buttons sit at the bottom of the screen. */}
      <div className="flex-1" />
      <Button type="submit" pending={pending}>
        Add card
      </Button>
      {/* Button, Text (371:2838): 15px Semi Bold violet, no underline. */}
      <Button type="button" variant="secondary" className="w-auto self-start px-3" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

// For a student who already has a card (US-02). Flow F, F7 (Figma 477:2899):
// opened from Profile, Back, Cancel and Add card all return to Profile, and
// Cancel and Add card replace this entry (G1), so Back afterwards never
// reopens the form. Opened from anywhere else they return Home the same way.
// The frame draws no bottom bar.
export function AddCardScreen({ fromAccount = false }: { fromAccount?: boolean }) {
  const router = useRouter();
  const back = fromAccount ? { href: ROUTES.settings, label: "Your account" } : { href: ROUTES.home, label: "Home" };
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={back.href} backLabel={back.label} />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Add a card you already have</h1>
          <p className="text-body-m text-indigo-black">We’ll show it on Home. Only its name is needed.</p>
          <AddCardForm
            onAdded={() => {
              router.replace(back.href);
              router.refresh();
            }}
            onCancel={() => router.replace(back.href)}
            onSignedOut={() => router.replace(signInPath(ROUTES.home))}
          />
        </main>
      </div>
    </div>
  );
}
