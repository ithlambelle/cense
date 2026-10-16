"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";

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
      <Button type="submit" disabled={cardName.trim() === ""} pending={pending}>
        Add card
      </Button>
      <Button type="button" variant="link" className="self-center" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
