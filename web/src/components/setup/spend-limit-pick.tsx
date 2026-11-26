"use client";

// Created with Claude Code (2026-11-08). S3, "Pick your limit" (Figma Design
// Edits 477:1149, US-04), reached only from S2's "Pick my own": a tighter
// choice, the 30% suggestion, or another amount up to the credit limit. Going
// above 30% gets a plain fact, not a warning. "Save my limit" saves it, lights
// the "Set a spend limit" star and returns where the student started.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { legacyCard } from "@/components/legacy/answer-card";
import { ChoiceCard } from "@/components/ui/choice-card";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import { saveSpendLimit } from "@/lib/api-client/applications";
import { centsToInput, dollarsToCents, moneyAmount } from "@/lib/money";
import { SPEND_LIMIT_PERCENT } from "@/lib/plan/spend-limit";
import {
  signInPath,
  spendLimitBackLink,
  spendLimitPickPath,
  spendLimitSuggestionPath,
  type CardOrigin,
  type SpendLimitOrigin,
} from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

import { FRAME_FIELD, InfoCallout, SAVED_PAUSE_MS, SavedLimitStatus, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

// True when the amount picked, or typed in "Another amount", is over the 30%
// suggestion. An amount that cannot be read yet is not.
export function overSuggestion(picked: number | null, other: string, suggestedCents: number): boolean {
  const cents = picked ?? dollarsToCents(other, { minCents: 1, maxCents: Number.MAX_SAFE_INTEGER });
  return cents !== null && cents > suggestedCents;
}

export function SpendLimitPick({
  applicationId,
  creditLimitCents,
  suggestedCents,
  tighterCents,
  savedCents,
  from,
  cardId = null,
  cardFrom,
}: {
  applicationId: string;
  creditLimitCents: number;
  suggestedCents: number;
  // Null when the limit is too small for a tighter choice.
  tighterCents: number | null;
  // The limit saved before, shown as picked when the student comes back.
  savedCents: number | null;
  from: SpendLimitOrigin;
  // Opened from the card's page ("card"): its catalog id and its own origin,
  // so a save returns to that page as it was opened.
  cardId?: string | null;
  cardFrom?: CardOrigin;
}) {
  const router = useRouter();
  const isMounted = useIsMounted();
  // The limit just saved, said before the screen moves on.
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const choices = [
    ...(tighterCents === null ? [] : [{ cents: tighterCents, label: `${moneyAmount(tighterCents)} a month, tighter` }]),
    { cents: suggestedCents, label: `${moneyAmount(suggestedCents)} a month, ${SPEND_LIMIT_PERCENT}% of your limit` },
  ];
  const savedIsChoice = savedCents !== null && choices.some((choice) => choice.cents === savedCents);
  // The frame picks the suggestion; a limit saved before is picked instead.
  const [picked, setPicked] = useState<number | null>(savedCents === null ? suggestedCents : savedIsChoice ? savedCents : null);
  const [other, setOther] = useState(savedCents !== null && !savedIsChoice ? centsToInput(savedCents) : "");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    let cents = picked;
    if (cents === null) {
      cents = dollarsToCents(other, { minCents: 100, maxCents: creditLimitCents });
      if (cents === null) {
        setError(`Enter an amount from $1 to ${moneyAmount(creditLimitCents)}.`);
        return;
      }
    }
    setError(null);
    setFailed(null);
    setSaving(true);
    const result = await saveSpendLimit(applicationId, cents);
    if (!isMounted()) return;
    if (result.kind === "ok") {
      setJustSaved(cents);
      await new Promise((resolve) => setTimeout(resolve, SAVED_PAUSE_MS));
      if (!isMounted()) return;
      // In place of this screen, so Back does not reopen a saved form. Stays
      // pending while that screen loads, so Save cannot go twice.
      router.replace(spendLimitBackLink(applicationId, from, cardId, cardFrom).href);
      router.refresh();
      return;
    }
    setSaving(false);
    if (result.kind === "signed-out") router.replace(signInPath(spendLimitPickPath(applicationId)));
    else setFailed(result.message);
  }

  return (
    <SetupScreen back={{ href: spendLimitSuggestionPath(applicationId, from, cardFrom), label: "Your suggestion" }}>
      <form onSubmit={save} noValidate className="flex flex-1 flex-col gap-4">
        <SetupHeading size="h3">Pick your limit</SetupHeading>
        <div role="radiogroup" aria-label="Pick your limit" className={cn(SENSITIVE, "flex flex-col gap-4")}>
          {choices.map((choice) => {
            const selected = picked === choice.cents;
            return (
              <ChoiceCard
                key={choice.cents}
                role="radio"
                state={selected ? "selected" : "default"}
                aria-checked={selected}
                disabled={saving}
                legacyClassName={legacyCard.spendLimit(selected)}
                onClick={() => {
                  setPicked(choice.cents);
                  setOther("");
                  setError(null);
                }}
              >
                {choice.label}
              </ChoiceCard>
            );
          })}
        </div>
        <TextField
          label="Another amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="$0"
          hint="Per month"
          value={other}
          onChange={(event) => {
            setOther(event.target.value);
            setPicked(event.target.value.trim() === "" ? suggestedCents : null);
            setError(null);
          }}
          error={error ?? undefined}
          disabled={saving}
          className={cn(SENSITIVE, FRAME_FIELD.className)}
          inputClassName={FRAME_FIELD.inputClassName}
          labelClassName={FRAME_FIELD.labelClassName}
        />
        <Spacer />
        {/* Only while the amount is over the suggestion: it showed while a
            student typed $100 of $1,000 (persona walk, Nov 25). */}
        {overSuggestion(picked, other, suggestedCents) ? (
          <div className={SENSITIVE}>
            <InfoCallout title={`Above ${moneyAmount(suggestedCents)}`}>
              That is over {SPEND_LIMIT_PERCENT}% of your limit. It can raise the balance your issuer reports.
            </InfoCallout>
          </div>
        ) : null}
        {failed ? <ErrorMessage>{failed}</ErrorMessage> : null}
        <SavedLimitStatus cents={justSaved} />
        <Button type="submit" pending={saving}>
          Save my limit
        </Button>
      </form>
    </SetupScreen>
  );
}
