"use client";

// Created with Claude Code (2026-11-08). I3, "Did you turn on autopay?"
// (Figma Design Edits 477:1668, US-10). The student says which autopay they
// chose at the issuer, or Not yet. Nothing is picked for them (edited Nov 7).
// Save stores autopay and the payment type, then shows "Autopay is on" (I5),
// or the setup list again for Not yet (the card's page when opened from it). Minimum only gets a plain fact, not a
// warning.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { legacyCard } from "@/components/legacy/answer-card";
import { ChoiceCard } from "@/components/ui/choice-card";
import { ErrorMessage } from "@/components/ui/error-message";
import { saveAutopayAnswer } from "@/lib/api-client/applications";
import {
  autopayBackLink,
  autopayConfirmPath,
  autopayOnPath,
  autopayStepsPath,
  signInPath,
  type AutopayOrigin,
  type CardOrigin,
} from "@/lib/routes";
import { AUTOPAY_ANSWERS } from "@/lib/setup/progress";

import { HandoffStrip, InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

type Answer = (typeof AUTOPAY_ANSWERS)[number]["value"];

export function AutopayConfirm({
  applicationId,
  issuerName,
  from = "setup",
  cardId = null,
  cardFrom,
}: {
  applicationId: string;
  issuerName: string | null;
  // "card": opened from the card's page (its catalog id and own origin given).
  from?: AutopayOrigin;
  cardId?: string | null;
  cardFrom?: CardOrigin;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!answer) {
      setError("Pick one answer.");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await saveAutopayAnswer(applicationId, answer);
    if (result.kind === "ok") {
      // Stays pending while the next screen loads, so Save cannot go twice.
      router.push(
        answer === "not_yet" ? autopayBackLink(applicationId, from, cardId, cardFrom).href : autopayOnPath(applicationId, from, cardFrom),
      );
      router.refresh();
      return;
    }
    setSaving(false);
    // Back to this question after signing in, not the steps before it.
    if (result.kind === "signed-out") router.replace(signInPath(autopayConfirmPath(applicationId)));
    else setError(result.message);
  }

  return (
    <SetupScreen back={{ href: autopayStepsPath(applicationId, from, cardFrom), label: "Autopay steps" }}>
      <HandoffStrip issuer={issuerName ?? "Your card"} stage="confirm" />
      <SetupHeading size="h3">Did you turn on autopay?</SetupHeading>
      <div role="radiogroup" aria-label="Did you turn on autopay?" className="flex flex-col gap-4">
        {AUTOPAY_ANSWERS.map((option) => (
          <ChoiceCard
            key={option.value}
            role="radio"
            state={answer === option.value ? "selected" : "default"}
            aria-checked={answer === option.value}
            disabled={saving}
            legacyClassName={legacyCard.autopay}
            onClick={() => {
              setAnswer(option.value);
              setError(null);
            }}
          >
            {option.label}
          </ChoiceCard>
        ))}
      </div>
      <Spacer />
      <InfoCallout title="Minimum only">Interest builds on the rest. The full balance avoids it.</InfoCallout>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button pending={saving} onClick={save}>
        Save
      </Button>
    </SetupScreen>
  );
}
