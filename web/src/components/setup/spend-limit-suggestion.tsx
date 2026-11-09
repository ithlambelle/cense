"use client";

// Created with Claude Code (2026-11-08). S2, "A limit to try this month"
// (Figma Design Edits 477:1043, US-04, edited Nov 7): 30% of the credit limit
// in the Hero card, how it was worked out in two rows, then "Use $150", which
// saves it and lights the "Set a spend limit" star, or "Pick my own" (S3).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE } from "@/lib/analytics";
import { saveSpendLimit } from "@/lib/api-client/applications";
import { moneyAmount } from "@/lib/money";
import { SPEND_LIMIT_PERCENT } from "@/lib/plan/spend-limit";
import { signInPath, spendLimitBackLink, spendLimitPickPath, spendLimitSuggestionPath, type SpendLimitOrigin } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { InfoCallout, SetupHeading, SetupScreen, Spacer } from "./setup-parts";

export function SpendLimitSuggestion({
  applicationId,
  creditLimitCents,
  suggestedCents,
  from,
}: {
  applicationId: string;
  creditLimitCents: number;
  suggestedCents: number;
  from: SpendLimitOrigin;
}) {
  const router = useRouter();
  const back = spendLimitBackLink(applicationId, from);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suggested = moneyAmount(suggestedCents);

  async function use() {
    setError(null);
    setSaving(true);
    const result = await saveSpendLimit(applicationId, suggestedCents);
    if (result.kind === "ok") {
      // Back where the student started, with the star lit, in place of this
      // screen so Back does not reopen it. Stays pending while that screen
      // loads, so the button cannot go twice.
      router.replace(back.href);
      router.refresh();
      return;
    }
    setSaving(false);
    if (result.kind === "signed-out") router.replace(signInPath(spendLimitSuggestionPath(applicationId)));
    else setError(result.message);
  }

  return (
    <SetupScreen back={back}>
      <SetupHeading>A limit to try this month</SetupHeading>

      {/* Card / Hero (477:1049): navy, the one number. */}
      <section aria-label="Suggested spend limit" className="flex w-full flex-col gap-2 rounded-card bg-navy p-5 text-white">
        <p className="text-body-s">Suggested spend limit</p>
        <p className={cn(SENSITIVE, "font-number text-[2.25rem] leading-[2.75rem] font-semibold")}>{suggested}</p>
        <p className="text-body-s">a month. Staying under {SPEND_LIMIT_PERCENT}% of your limit is good for your credit score.</p>
      </section>

      <dl className={cn(SENSITIVE, "flex w-full flex-col gap-4")}>
        <div className="flex items-center border-b border-off-white py-[11px] text-body-m text-indigo-black">
          <dt className="min-w-0 flex-1">Your limit</dt>
          <dd className="whitespace-nowrap">{moneyAmount(creditLimitCents)}</dd>
        </div>
        <div className="flex items-center border-b border-off-white py-[11px] text-body-m font-semibold text-navy">
          <dt className="min-w-0 flex-1">{SPEND_LIMIT_PERCENT}% of your limit</dt>
          <dd className="whitespace-nowrap">{suggested}</dd>
        </div>
      </dl>

      <Spacer />
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button pending={saving} onClick={use} className={SENSITIVE}>
        Use {suggested}
      </Button>
      <Link href={spendLimitPickPath(applicationId, from)} className={cn(buttonVariants({ variant: "outline" }), "text-button text-violet")}>
        Pick my own
      </Link>
      <InfoCallout title="Educational, not financial advice">A starting point. Change it any time.</InfoCallout>
    </SetupScreen>
  );
}
