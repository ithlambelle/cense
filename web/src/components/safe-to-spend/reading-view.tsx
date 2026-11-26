"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Constellation, STAR } from "@/components/home/constellation";
import { GroupHeading, ReadRow, TotalRow } from "@/components/your-money/parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ListRowText } from "@/components/ui/list-row";
import { SENSITIVE } from "@/lib/analytics";
import { markBudgetChecked, readBankFindings, type BankFindingsData } from "@/lib/api-client/safe-to-spend";
import { monthName } from "@/lib/budget/lines";
import { moneyAmount } from "@/lib/money";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-21). Right after a bank links, Cense reads
// what the bank already shows instead of asking (Ben, Nov 21), and the wait
// becomes the last beat of the welcome: step L1 (Figma 821:8555). Penny, the
// constellation lighting star by star, then one row per thing found. The
// student checks it against their own life and fixes anything that is off.
// Then step 3, "Looks right?": last month from the bank (the This month
// budget, in totals), Looks right (saved for Home's next step, then Home) or
// Fix something (the questions, filled in).

// How long each finding waits before it lands, so the screen reads as Penny
// working through the bank, not a list dumped at once.
const STEP_MS = 550;
// A student who asked for less motion gets every row at once.
const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCE);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const reducedMotionNow = () => Boolean(window.matchMedia?.(REDUCE).matches);
const STARS = 5;

type Findings = BankFindingsData["findings"];
type LastMonth = NonNullable<BankFindingsData["lastMonth"]>;
type State =
  | { kind: "reading" }
  | { kind: "found"; findings: Findings; lastMonth: LastMonth | null }
  // The bank has sent too little history to answer from (a just-opened
  // account, or Plaid still sending it): the questions instead.
  | { kind: "thin" }
  | { kind: "failed"; message: string };

const sum = (lines: { amountCents: number }[]) => lines.reduce((total, line) => total + line.amountCents, 0);

// Last month in four lines, as This month adds it up (Show, don't
// prescribe: the student's own numbers, no advice). Left out until the bank
// has sent anything.
function LastMonthTotals({ budget }: { budget: LastMonth }) {
  const short = budget.shortfallCents > 0;
  return (
    <section aria-labelledby="last-month" className="flex w-full flex-col gap-1 pt-4 motion-safe:animate-fade-up">
      <GroupHeading id="last-month">Here’s {monthName(budget.month)}</GroupHeading>
      <ul className="flex flex-col">
        <ReadRow label="Money in" value={moneyAmount(budget.income.amountCents)} />
        <ReadRow label="Needs" value={moneyAmount(sum(budget.needs))} />
        <ReadRow label="Wants" value={moneyAmount(sum(budget.wants))} />
        {budget.saving.amountCents > 0 ? <ReadRow label={budget.saving.label} value={moneyAmount(budget.saving.amountCents)} /> : null}
        <TotalRow label={short ? "Short" : "Left over"} value={moneyAmount(short ? budget.shortfallCents : budget.remainingCents)} />
      </ul>
    </section>
  );
}

// Lit star, the List row's "Done" lead (371:3118): amber, 24px.
function DoneStar() {
  return <span aria-hidden="true" className={cn(STAR, "block size-6 shrink-0 bg-amber")} />;
}

// The List row's empty lead (371:3102): a 24px ring, for what the bank did not show.
function EmptyLead() {
  return <span aria-hidden="true" className="block size-6 shrink-0 rounded-pill border-[1.5px] border-indigo-black/30" />;
}

// Everything found gets its own row; the bills the bank never shows share one
// quiet row at the end, so a lit star always means something was found.
function rows(findings: Findings): { key: string; title: string; detail: string; found: boolean }[] {
  const missing = findings.filter((finding) => !finding.found).map((finding) => finding.title);
  const found = findings.filter((finding) => finding.found);
  return missing.length ? [...found, { key: "missing", title: "Not in your bank", detail: missing.join(", "), found: false }] : found;
}

const HEADINGS = {
  reading: { title: "Reading your bank", body: "Finding your pay and bills, so you don’t have to type them." },
  found: { title: "Reading your bank", body: "Finding your pay and bills, so you don’t have to type them." },
  done: { title: "Here’s what we found", body: "Fix anything that looks off. You can change it later too." },
  thin: { title: "Your bank is still catching up", body: "We only see a few days so far. Answer a few quick questions instead." },
  failed: { title: "We couldn’t read your bank", body: "Try again, or answer a few questions instead." },
} as const;

export function ReadingView() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [state, setState] = useState<State>({ kind: "reading" });
  const [checking, setChecking] = useState(false);
  const [shown, setShown] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    readBankFindings().then((outcome) => {
      if (!live) return;
      if (outcome.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpendReading));
      if (outcome.kind === "failed") {
        if (outcome.code === "not_linked") return router.replace(ROUTES.safeToSpendConnect);
        return setState({ kind: "failed", message: outcome.message });
      }
      if (!outcome.data.enoughHistory && !outcome.data.safeToSpend.answered) return setState({ kind: "thin" });
      setState({ kind: "found", findings: outcome.data.findings, lastMonth: outcome.data.lastMonth });
    });
    return () => {
      live = false;
    };
  }, [router, attempt]);

  const total = state.kind === "found" ? rows(state.findings).length : 0;
  const instant = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
  const landed = instant ? total : shown;
  useEffect(() => {
    if (state.kind !== "found" || instant || shown >= total) return;
    const timer = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [state.kind, instant, shown, total]);

  const done = state.kind === "found" && landed >= total;

  // Saved, then Home, and stays pending while Home loads. The check is a note
  // for Home's next step, not something the student is waiting on, so a failed
  // save is logged and they go Home anyway. Replace: the reading is done, so
  // Back never returns to it.
  async function looksRight() {
    if (checking) return;
    setChecking(true);
    const outcome = await markBudgetChecked();
    if (!isMounted()) return;
    if (outcome.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpendReading));
    if (outcome.kind === "failed") console.warn(JSON.stringify({ event: "budget_check_save_failed", code: outcome.code ?? null }));
    router.replace(ROUTES.home);
  }
  // One star per fifth of the rows, the last one when everything has landed.
  const lit = done ? STARS : total ? Math.min(STARS - 1, Math.floor((landed / total) * STARS)) : 0;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col items-center gap-4 px-6 pt-12 pb-6" aria-busy={state.kind === "reading" || (state.kind === "found" && !done)}>
        {/* Avatar, Penny, Large (371:3348). */}
        <Image src="/mascot/astro-pig/avatar.png" alt="" width={64} height={64} priority className="size-16 shrink-0 rounded-pill bg-light-blue/50" />
        <div className="w-full max-w-[299px]">
          <Constellation count={lit} layout="five" />
        </div>
        <h1 className="text-center font-heading text-h3 font-semibold text-navy">{HEADINGS[done ? "done" : state.kind].title}</h1>
        <p className="text-center text-body-m text-indigo-black/70">{HEADINGS[done ? "done" : state.kind].body}</p>

        {state.kind === "thin" ? (
          <div className="flex w-full flex-col gap-3 pt-2">
            <Link href={safeToSpendSetupPath()} replace className={buttonVariants()}>
              Answer a few questions
            </Link>
          </div>
        ) : null}

        {state.kind === "failed" ? (
          <div className="flex w-full flex-col gap-3">
            <ErrorMessage>{state.message}</ErrorMessage>
            <Button onClick={() => { setState({ kind: "reading" }); setShown(0); setAttempt((n) => n + 1); }}>Try again</Button>
            <Link href={safeToSpendSetupPath()} className={buttonVariants({ variant: "secondary" })}>
              Answer a few questions instead
            </Link>
          </div>
        ) : null}

        {/* Replace, not push: the reading is done, so Back never returns to it. */}
        {state.kind === "found" ? (
          // Every row is read from the bank (payees, amounts, days), so session
          // replay masks the whole list (Data Policy section 5).
          <ul aria-label="What we found" aria-live="polite" className={cn(SENSITIVE, "flex w-full flex-col")}>
            {rows(state.findings).slice(0, landed).map((row) => (
              <li key={row.key} className="flex items-center gap-3 border-b border-off-white py-3.5 motion-safe:animate-fade-up">
                {row.found ? <DoneStar /> : <EmptyLead />}
                <ListRowText title={row.title} subtitle={row.detail} />
              </li>
            ))}
          </ul>
        ) : null}

        {done && state.lastMonth?.hasBankData ? <LastMonthTotals budget={state.lastMonth} /> : null}

        {/* The question comes after last month, not pinned over it: the
            student reads their numbers, then answers. On a phone they scroll
            to it. */}
        {done ? (
          <div className="mt-auto flex w-full flex-col gap-2 pt-4 motion-safe:animate-fade-up">
            <h2 className="pb-1 text-center font-heading text-h6 font-medium text-navy">Looks right?</h2>
            <Button type="button" pending={checking} onClick={looksRight}>
              Looks right
            </Button>
            {/* Replace, not push: the reading is done, so Back never returns to it. */}
            <Link href={safeToSpendSetupPath()} replace className={buttonVariants({ variant: "secondary" })}>
              Fix something
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
