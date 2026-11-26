"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { limitToCents } from "@/components/applications/mark-result";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { LIST_ROW, ListRowText } from "@/components/ui/list-row";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE, track } from "@/lib/analytics";
import { previousScreenIs } from "@/lib/back-navigation";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

// A card in the catalog, as Add a card offers it: its id and the name
// students know it by (cardDisplayName).
export type CatalogChoice = { id: string; name: string };

type AddCardFormProps = {
  catalog: CatalogChoice[];
  onAdded: () => void;
  onCancel: () => void;
  onSignedOut: () => void;
};

// The most catalog cards listed under the name field at once.
const MAX_MATCHES = 5;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Catalog cards whose name holds every word typed, in any order, from the
// second letter on: "disc cash" finds Discover it Student Cash Back.
export function matchingCards(catalog: CatalogChoice[], typed: string): CatalogChoice[] {
  const words = normalize(typed).split(" ").filter(Boolean);
  if (words.join("").length < 2) return [];
  return catalog.filter((card) => {
    const name = normalize(card.name);
    return words.every((word) => name.includes(word));
  }).slice(0, MAX_MATCHES);
}

// For a student who already has a card. They pick it from the catalog as they
// type, so it gets its catalog id: its own card page, and the quiz never
// offers it back. "My card isn’t listed" keeps the name as typed (no id). A
// name typed in full that matches a catalog card exactly gets its id too.
// Its credit limit is optional.
function AddCardForm({ catalog, onAdded, onCancel, onSignedOut }: AddCardFormProps) {
  const isMounted = useIsMounted();
  const [cardName, setCardName] = useState("");
  // The catalog card picked from the list, until the name is edited again.
  const [picked, setPicked] = useState<CatalogChoice | null>(null);
  // "My card isn’t listed": no list under the field until it is emptied.
  const [notListed, setNotListed] = useState(false);
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
    const typed = normalize(cardName);
    const card = picked ?? catalog.find((entry) => normalize(entry.name) === typed) ?? null;
    const result = await apiRequest("post", "/applications", {
      body: { cardId: card?.id ?? null, cardName: card?.name ?? cardName.trim(), status: "approved", creditLimitCents },
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
    if (result.kind === "api" && result.code === "already_exists") {
      setError("This card is already on your list.");
      return;
    }
    setError(result.kind === "api" && result.code === "invalid_request" ? "Enter the card’s name." : failureMessage(result));
  }

  const matches = picked || notListed ? [] : matchingCards(catalog, cardName);

  return (
    <form method="post" onSubmit={submit} className="flex flex-1 flex-col gap-4" noValidate>
      <TextField
        label="Card name"
        name="cardName"
        placeholder="For example, Student Cash Card"
        maxLength={160}
        autoComplete="off"
        value={cardName}
        onChange={(event) => {
          setCardName(event.target.value);
          setPicked(null);
          if (event.target.value.trim() === "") setNotListed(false);
        }}
        hint={picked ? "From our card list." : undefined}
        error={error ?? undefined}
        disabled={pending}
      />
      {matches.length > 0 ? (
        <div className="-mt-2 flex flex-col">
          <ul aria-label="Cards that match">
            {matches.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className={cn(LIST_ROW, "w-full text-left")}
                  disabled={pending}
                  onClick={() => {
                    setPicked(card);
                    setCardName(card.name);
                    setError(null);
                  }}
                >
                  <ListRowText title={card.name} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-1 h-9 w-auto self-start px-3"
            disabled={pending}
            onClick={() => setNotListed(true)}
          >
            My card isn’t listed
          </Button>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {matches.length > 0 ? `${matches.length} ${matches.length === 1 ? "card matches" : "cards match"}` : ""}
      </p>
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
export function AddCardScreen({ catalog, fromAccount = false }: { catalog: CatalogChoice[]; fromAccount?: boolean }) {
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
            catalog={catalog}
            onAdded={() => {
              router.replace(back.href);
              router.refresh();
            }}
            // Cancel returns to the screen behind when it is the parent, so it
            // is never in the history twice. Adding still replaces, so the
            // parent loads fresh with the new card.
            onCancel={() => (previousScreenIs(back.href) ? window.history.back() : router.replace(back.href))}
            onSignedOut={() => router.replace(signInPath(ROUTES.home))}
          />
        </main>
      </div>
    </div>
  );
}
