// Created with Claude Code (2026-11-08). I1, "Set up your <Card> card"
// (Figma Design Edits 477:1570, US-10): the card, its dates, then the three
// first-month steps as the same star list Home shows. Rows open the screen
// where that step is done (the spend limit ticks in place); stars light as
// steps finish.

import Link from "next/link";

import { ButtonChevron, buttonVariants } from "@/components/ui/button";
import type { SetupProgress } from "@/lib/setup/progress";
import { autopayOnPath, autopayStepsPath, paymentRemindersPath, ROUTES } from "@/lib/routes";

import { SetupHeading, SetupScreen, Spacer, StarRow, UpNextRow } from "./setup-parts";
import { SpendLimitRow } from "./spend-limit-row";

export function CardSetupList({
  applicationId,
  cardName,
  brand,
  progress,
}: {
  applicationId: string;
  cardName: string;
  // "Discover", or null for a card added from outside the catalog.
  brand: string | null;
  progress: SetupProgress;
}) {
  const reminders = paymentRemindersPath(applicationId, "setup");
  return (
    <SetupScreen back={{ href: ROUTES.home, label: "Home" }}>
      <SetupHeading>{brand ? `Set up your ${brand} card` : "Set up your card"}</SetupHeading>

      {/* List row, Card art (371:3206), no chevron: the card itself. */}
      <div className="flex w-full items-center gap-3 border-b border-off-white py-3.5">
        <span aria-hidden="true" className="relative h-[38px] w-14 shrink-0 rounded-[6px] bg-navy">
          <span className="absolute top-[9px] left-[7px] h-2 w-[11px] rounded-[2px] bg-amber" />
          <span className="absolute top-[27px] left-[7px] h-[3px] w-[26px] rounded-[2px] bg-white/35" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
          <span className="text-body-m leading-[normal] font-medium text-indigo-black">{cardName}</span>
          <span className="text-body-s leading-[normal] text-indigo-black/70">Approved</span>
        </span>
      </div>

      <StarRow title="Add your dates" subtitle="Statement and due day" done={progress.dates} href={reminders} />

      <h2 className="text-body-m font-semibold text-navy">Three steps</h2>

      <ul className="flex flex-col gap-4">
        <li>
          {progress.autopay ? (
            <StarRow title={brand ? `Turn on autopay at ${brand}` : "Turn on autopay"} subtitle="You said it is on" done href={autopayOnPath(applicationId)} />
          ) : (
            <UpNextRow
              title={brand ? `Turn on autopay at ${brand}` : "Turn on autopay"}
              subtitle={brand ? `The steps and a link to ${brand}` : "The steps to follow"}
              action="See steps"
              href={autopayStepsPath(applicationId)}
            />
          )}
        </li>
        <li>
          <SpendLimitRow applicationId={applicationId} done={progress.spendLimit} />
        </li>
        <li>
          <StarRow title="Choose your reminders" subtitle="One email before each date" done={progress.reminders} href={reminders} />
        </li>
      </ul>

      <Spacer />
      {progress.autopay ? (
        <Link href={ROUTES.home} className={buttonVariants()}>
          Back to Home
          <ButtonChevron />
        </Link>
      ) : (
        <Link href={autopayStepsPath(applicationId)} className={buttonVariants()}>
          Set up autopay
          <ButtonChevron />
        </Link>
      )}
    </SetupScreen>
  );
}
