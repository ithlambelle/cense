"use client";

// Created with Claude Code (2026-11-08). S1, "What is your credit limit?"
// (Figma Design Edits 477:1101, US-04). One field, prefilled from the card
// when it has a limit. "See my suggestion" saves a new or changed limit, then
// shows the suggestion (S2).

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { limitToCents } from "@/components/applications/mark-result";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import { saveCreditLimit } from "@/lib/api-client/applications";
import { centsToInput } from "@/lib/money";
import { signInPath, spendLimitBackLink, spendLimitCreditPath, spendLimitSuggestionPath, type SpendLimitOrigin } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { FRAME_FIELD, InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

export function SpendLimitCredit({
  applicationId,
  creditLimitCents,
  from,
}: {
  applicationId: string;
  creditLimitCents: number | null;
  from: SpendLimitOrigin;
}) {
  const router = useRouter();
  const known = creditLimitCents !== null && creditLimitCents > 0;
  const [value, setValue] = useState(known ? `$${centsToInput(creditLimitCents)}` : "");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = limitToCents(value);
    if (cents === null || cents === undefined) {
      setError("Enter your credit limit in dollars, like 500.");
      return;
    }
    setError(null);
    setFailed(null);
    setSaving(true);
    if (cents !== creditLimitCents) {
      const result = await saveCreditLimit(applicationId, cents);
      if (result.kind !== "ok") {
        setSaving(false);
        if (result.kind === "signed-out") router.replace(signInPath(spendLimitCreditPath(applicationId)));
        else setFailed(result.message);
        return;
      }
    }
    // S2 replaces this screen, so Back never reopens a saved form. Stays
    // pending while S2 loads, so the button cannot go twice.
    router.replace(spendLimitSuggestionPath(applicationId, from));
  }

  return (
    <SetupScreen back={spendLimitBackLink(applicationId, from)}>
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4">
        <SetupHeading size="h3">What is your credit limit?</SetupHeading>
        <p className="text-body-m text-indigo-black">We use it to suggest a monthly spend limit for this card.</p>
        <TextField
          label="Credit limit"
          inputMode="decimal"
          autoComplete="off"
          placeholder="$500"
          hint={known ? "From your card. Edit it if it is wrong." : "Find it in the approval email or the issuer’s app."}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          disabled={saving}
          className={cn(SENSITIVE, FRAME_FIELD.className)}
          inputClassName={FRAME_FIELD.inputClassName}
          labelClassName={FRAME_FIELD.labelClassName}
        />
        <Spacer />
        <InfoCallout title="Educational, not financial advice">Your limit, your call.</InfoCallout>
        {failed ? <ErrorMessage>{failed}</ErrorMessage> : null}
        <Button type="submit" pending={saving}>
          See my suggestion
        </Button>
      </form>
    </SetupScreen>
  );
}
