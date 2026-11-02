"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { limitToCents } from "@/components/applications/mark-result";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
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
    <form method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
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
      <Button type="submit" pending={pending}>
        Add card
      </Button>
      <Button type="button" variant="link" className="self-center" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

// For a student who already has a card (US-02). No frame: built from the auth
// form's parts and proposed to design.
export function AddCardScreen() {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Add a card you already have</h1>
            <p className="text-body-m text-indigo-black">We’ll show it on Home. Only its name is needed; you can add its credit limit too.</p>
          </div>
          <AddCardForm
            onAdded={() => {
              router.push(ROUTES.home);
              router.refresh();
            }}
            onCancel={() => router.push(ROUTES.home)}
            onSignedOut={() => router.replace(signInPath(ROUTES.home))}
          />
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
