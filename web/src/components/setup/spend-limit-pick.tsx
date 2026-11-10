"use client";

// Created with Claude Code (2026-11-08). S3, "Pick your limit" (Figma Design
// Edits 477:1149, US-04), reached only from S2's "Pick my own": a tighter
// choice, the 30% suggestion, or another amount up to the credit limit. Going
// above 30% gets a plain fact, not a warning. "Save my limit" saves it, lights
// the "Set a spend limit" star and returns where the student started.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import { saveSpendLimit } from "@/lib/api-client/applications";
import { centsToInput, dollarsToCents, moneyAmount } from "@/lib/money";
import { SPEND_LIMIT_PERCENT } from "@/lib/plan/spend-limit";
import { signInPath, spendLimitBackLink, spendLimitPickPath, spendLimitSuggestionPath, type SpendLimitOrigin } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { FRAME_FIELD, InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

export function SpendLimitPick({
  applicationId,
  creditLimitCents,
  suggestedCents,
  tighterCents,
  savedCents,
  from,
}: {
  applicationId: string;
  creditLimitCents: number;
  suggestedCents: number;
  // Null when the limit is too small for a tighter choice.
  tighterCents: number | null;
  // The limit saved before, shown as picked when the student comes back.
  savedCents: number | null;
  from: SpendLimitOrigin;
}) {
  const router = useRouter();
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
    if (result.kind === "ok") {
      // In place of this screen, so Back does not reopen a saved form. Stays
      // pending while that screen loads, so Save cannot go twice.
      router.replace(spendLimitBackLink(applicationId, from).href);
      router.refresh();
      return;
    }
    setSaving(false);
    if (result.kind === "signed-out") router.replace(signInPath(spendLimitPickPath(applicationId)));
    else setFailed(result.message);
  }

  return (
    <SetupScreen back={{ href: spendLimitSuggestionPath(applicationId, from), label: "Your suggestion" }}>
      <form onSubmit={save} noValidate className="flex flex-1 flex-col gap-4">
        <SetupHeading size="h3">Pick your limit</SetupHeading>
        <div role="radiogroup" aria-label="Pick your limit" className={cn(SENSITIVE, "flex flex-col gap-4")}>
          {choices.map((choice) => {
            const selected = picked === choice.cents;
            return (
              <button
                key={choice.cents}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={saving}
                onClick={() => {
                  setPicked(choice.cents);
                  setOther("");
                  setError(null);
                }}
                className={cn(
                  "flex h-14 w-full items-center justify-between rounded-button border-violet bg-white pr-4 pl-[18px] text-left text-body-m leading-[normal] font-medium text-indigo-black",
                  "hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress",
                  selected ? "border-2" : "border",
                )}
              >
                {choice.label}
                <SelectionMark selected={selected} />
              </button>
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
        <div className={SENSITIVE}>
          <InfoCallout title={`Above ${moneyAmount(suggestedCents)}`}>
            That is over {SPEND_LIMIT_PERCENT}% of your limit. It can raise the balance your issuer reports.
          </InfoCallout>
        </div>
        {failed ? <ErrorMessage>{failed}</ErrorMessage> : null}
        <Button type="submit" pending={saving}>
          Save my limit
        </Button>
      </form>
    </SetupScreen>
  );
}
