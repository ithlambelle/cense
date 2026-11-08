"use client";

// Created with Claude Code (2026-11-08). I1's "Set a spend limit" star
// (477:1580): ticked in place, the same plan step as Home's star. There is no
// spend limit screen to open (the old first-month plan page is retired), so
// the row is a checkbox, as on Home.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { savePlanStep } from "@/lib/api-client/plans";
import { cardSetupPath, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { ROW, ROW_LINK, StarLead } from "./setup-parts";

export function SpendLimitRow({ applicationId, done }: { applicationId: string; done: boolean }) {
  const router = useRouter();
  const [lit, setLit] = useState(done);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const value = !lit;
    setLit(value);
    setError(null);
    setSaving(true);
    const result = await savePlanStep(applicationId, "first_month", "spend_limit", value);
    setSaving(false);
    if (result.kind === "ok") {
      // The list is read on the server: refresh it, so Back shows this star.
      router.refresh();
      return;
    }
    setLit(!value);
    if (result.kind === "signed-out") router.replace(signInPath(cardSetupPath(applicationId)));
    else setError(result.message);
  }

  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={lit}
        disabled={saving}
        onClick={toggle}
        className={cn(ROW, ROW_LINK, "items-center disabled:cursor-progress")}
      >
        <StarLead lit={lit} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
          <span className={cn("text-body-m leading-[normal]", lit ? "text-indigo-black/70" : "font-medium text-indigo-black")}>Set a spend limit</span>
          <span className="text-body-s leading-[normal] text-indigo-black/70">A monthly limit to try</span>
        </span>
      </button>
      {error ? <ErrorMessage className="mt-2">{error}</ErrorMessage> : null}
    </>
  );
}
