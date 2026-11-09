"use client";

// Created with Claude Code (2026-11-08). I3, "Did you turn on autopay?"
// (Figma Design Edits 477:1668, US-10). The student says which autopay they
// chose at the issuer, or Not yet. Nothing is picked for them (edited Nov 7).
// Save stores autopay and the payment type, then shows "Autopay is on" (I5),
// or the setup list again for Not yet. Minimum only gets a plain fact, not a
// warning.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { saveAutopayAnswer } from "@/lib/api-client/applications";
import { autopayConfirmPath, autopayOnPath, autopayStepsPath, cardSetupPath, signInPath } from "@/lib/routes";
import { AUTOPAY_ANSWERS } from "@/lib/setup/progress";
import { cn } from "@/lib/utils";

import { HandoffStrip, InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

type Answer = (typeof AUTOPAY_ANSWERS)[number]["value"];

export function AutopayConfirm({ applicationId, issuerName }: { applicationId: string; issuerName: string | null }) {
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
      router.push(answer === "not_yet" ? cardSetupPath(applicationId) : autopayOnPath(applicationId));
      router.refresh();
      return;
    }
    setSaving(false);
    // Back to this question after signing in, not the steps before it.
    if (result.kind === "signed-out") router.replace(signInPath(autopayConfirmPath(applicationId)));
    else setError(result.message);
  }

  return (
    <SetupScreen back={{ href: autopayStepsPath(applicationId), label: "Autopay steps" }}>
      <HandoffStrip issuer={issuerName ?? "Your card"} stage="confirm" />
      <SetupHeading size="h3">Did you turn on autopay?</SetupHeading>
      <div role="radiogroup" aria-label="Did you turn on autopay?" className="flex flex-col gap-4">
        {AUTOPAY_ANSWERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={answer === option.value}
            disabled={saving}
            onClick={() => {
              setAnswer(option.value);
              setError(null);
            }}
            className={cn(
              "flex h-14 w-full items-center justify-between rounded-button border border-violet bg-white pr-4 pl-[18px] text-left text-body-m leading-[normal] font-medium text-indigo-black",
              "hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress",
            )}
          >
            {option.label}
            <SelectionMark selected={answer === option.value} />
          </button>
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
