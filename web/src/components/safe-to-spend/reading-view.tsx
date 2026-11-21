"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Constellation, STAR } from "@/components/home/constellation";
import { Button, ButtonChevron, buttonVariants } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ListRowText } from "@/components/ui/list-row";
import { SENSITIVE } from "@/lib/analytics";
import { readBankFindings, type BankFindingsData } from "@/lib/api-client/safe-to-spend";
import { ROUTES, safeToSpendSetupPath, signInPath, yourMoneyPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Created with Claude Code (2026-11-21). Right after a bank links, Cense reads
// what the bank already shows instead of asking (Ben, Nov 21), and the wait
// becomes the last beat of the welcome: step L1 (Figma 821:8555). Penny, the
// constellation lighting star by star, then one row per thing found. The
// student checks it against their own life and fixes anything that is off.

// How long each finding waits before it lands, so the screen reads as Penny
// working through the bank, not a list dumped at once.
const STEP_MS = 550;
const STARS = 5;

type Findings = BankFindingsData["findings"];
type State = { kind: "reading" } | { kind: "found"; findings: Findings } | { kind: "failed"; message: string };

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

export function ReadingView() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "reading" });
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
      setState({ kind: "found", findings: outcome.data.findings });
    });
    return () => {
      live = false;
    };
  }, [router, attempt]);

  const total = state.kind === "found" ? rows(state.findings).length : 0;
  useEffect(() => {
    if (state.kind !== "found" || shown >= total) return;
    const timer = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [state.kind, shown, total]);

  const done = state.kind === "found" && shown >= total;
  // One star per fifth of the rows, the last one when everything has landed.
  const lit = done ? STARS : total ? Math.min(STARS - 1, Math.floor((shown / total) * STARS)) : 0;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="flex w-full max-w-phone flex-col items-center gap-4 px-6 pt-12 pb-6" aria-busy={!done}>
        {/* Avatar, Penny, Large (371:3348). */}
        <Image src="/mascot/astro-pig/avatar.png" alt="" width={64} height={64} priority className="size-16 shrink-0 rounded-pill bg-light-blue/50" />
        <div className="w-full max-w-[299px]">
          <Constellation count={lit} layout="five" />
        </div>
        <h1 className="text-center font-heading text-h3 font-semibold text-navy">{done ? "Here’s what we found" : "Reading your bank"}</h1>
        <p className="text-center text-body-m text-indigo-black/70">
          {done ? "Fix anything that looks off. You can change it later too." : "Finding your pay and bills, so you don’t have to type them."}
        </p>

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
            {rows(state.findings).slice(0, shown).map((row) => (
              <li key={row.key} className="flex items-center gap-3 border-b border-off-white py-3.5 motion-safe:animate-fade-up">
                {row.found ? <DoneStar /> : <EmptyLead />}
                <ListRowText title={row.title} subtitle={row.detail} />
              </li>
            ))}
          </ul>
        ) : null}

        {done ? (
          <div className="mt-auto flex w-full flex-col gap-2 pt-4 motion-safe:animate-fade-up">
            <Link href={yourMoneyPath("month")} replace className={buttonVariants()}>
              Looks right
              <ButtonChevron />
            </Link>
            <Link href={safeToSpendSetupPath()} replace className={buttonVariants({ variant: "secondary" })}>
              Fix something
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
