"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";

type AddCardFormProps = {
  onAdded: () => void;
  onCancel: () => void;
  onSignedOut: () => void;
};

// For a student who already has a card. Only its name is asked for.
export function AddCardForm({ onAdded, onCancel, onSignedOut }: AddCardFormProps) {
  const [cardName, setCardName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (cardName.trim() === "") {
      setError("Enter the card’s name.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiRequest("post", "/applications", {
      body: { cardId: null, cardName: cardName.trim(), status: "approved", creditLimitCents: null },
    });
    if (result.ok) {
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
      <Button type="submit" pending={pending}>
        Add card
      </Button>
      <Button type="button" variant="link" className="self-center text-violet" disabled={pending} onClick={onCancel}>
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
        <AppHeader backHref={ROUTES.home} title="Add a card" />
        <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Add a card you already have</h1>
            <p className="text-body-m text-indigo-black">We’ll show it on Home. Only its name is needed.</p>
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
      </div>
    </div>
  );
}
