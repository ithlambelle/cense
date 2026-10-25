"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { answerCardClass } from "@/components/quiz/quiz-screen";
import { PreviewLabel } from "@/components/safe-to-spend/parts";
import { BACK_CONTROL } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE } from "@/lib/analytics";
import {
  amountInput,
  parseAmount,
  saveSafeToSpendAnswers,
  type BillAnswer,
} from "@/lib/api-client/safe-to-spend";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { BILLS, COVERED_BY, type Bill, type CoveredBy } from "@/lib/safe-to-spend/compute";
import { BILL_COPY, COVERED_BY_LABELS, SAFE_TO_SPEND_COPY, SHARE_LABEL } from "@/lib/safe-to-spend/copy";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

type Draft = Record<Bill, { coveredBy: CoveredBy | null; amount: string }>;

const AMOUNT_ERROR = "Enter an amount, like 650.";

const paysPart = (coveredBy: CoveredBy | null) => coveredBy === "me" || coveredBy === "split";

// The first step whose answer is missing or has no valid amount, or null.
function firstUnfinished(draft: Draft): number | null {
  const index = BILLS.findIndex((bill) => {
    const { coveredBy, amount } = draft[bill];
    return coveredBy === null || (paysPart(coveredBy) && parseAmount(amount) === null);
  });
  return index === -1 ? null : index + 1;
}

// "Who covers what" (Figma 222:2090), one bill a screen, then what to keep
// aside. Answers are kept here as the student moves between steps (each step
// is its own address, so Back works) and saved together at the end.
export function SetupFlow({
  step,
  savedBills,
  savedSetAsideCents,
  answered,
}: {
  step: number;
  savedBills: BillAnswer[];
  savedSetAsideCents: number;
  // True when the student is changing answers saved before.
  answered: boolean;
}) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [draft, setDraft] = useState<Draft>(() => {
    const initial = {} as Draft;
    for (const bill of BILLS) {
      const saved = savedBills.find((answer) => answer.bill === bill);
      initial[bill] = { coveredBy: saved?.coveredBy ?? null, amount: amountInput(saved?.monthlyCents ?? null) };
    }
    return initial;
  });
  const [setAside, setSetAside] = useState(answered && savedSetAsideCents > 0 ? amountInput(savedSetAsideCents) : "");
  // Shown only on the step it belongs to.
  const [error, setError] = useState<{ step: number; text: string; field?: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  const backHref = step === 1 ? (answered ? ROUTES.safeToSpend : ROUTES.home) : safeToSpendSetupPath(step - 1);
  const stepError = error?.step === step ? error : null;

  // Steps replace one another in history, so Back from wherever the questions
  // lead never reopens one (Mark result does the same after saving); the back
  // arrow steps through them.
  function goTo(next: number) {
    setError(null);
    router.replace(safeToSpendSetupPath(next));
  }

  function continueFromBill(event: FormEvent) {
    event.preventDefault();
    const bill = BILLS[step - 1];
    const { coveredBy, amount } = draft[bill];
    if (coveredBy === null) {
      setError({ step, text: `Pick who covers your ${BILL_COPY[bill].label.toLowerCase()}.` });
      return;
    }
    if (paysPart(coveredBy) && parseAmount(amount) === null) {
      setError({ step, text: AMOUNT_ERROR, field: true });
      return;
    }
    goTo(step + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const unfinished = firstUnfinished(draft);
    if (unfinished !== null) {
      goTo(unfinished);
      return;
    }
    const setAsideCents = setAside.trim() === "" ? 0 : parseAmount(setAside);
    if (setAsideCents === null) {
      setError({ step, text: AMOUNT_ERROR, field: true });
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveSafeToSpendAnswers({
      bills: BILLS.map((bill) => {
        const { coveredBy, amount } = draft[bill];
        return { bill, coveredBy: coveredBy!, monthlyCents: paysPart(coveredBy) ? parseAmount(amount) : null };
      }),
      setAsideCents,
    });
    if (!isMounted()) return;
    if (result.kind === "ok") {
      // Home, where the number now shows. Replace, so Back does not reopen this step.
      router.replace(ROUTES.home);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(ROUTES.safeToSpendSetup));
      return;
    }
    setError({ step, text: result.message });
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <StepHeader href={backHref} label={step === 1 ? (answered ? "How we got this" : "Home") : "the last question"} />
        <main className="flex flex-1 flex-col">
          {step <= BILLS.length ? (
            <BillStep
              key={step}
              step={step}
              bill={BILLS[step - 1]}
              answer={draft[BILLS[step - 1]]}
              error={stepError}
              onChange={(next) => {
                setError(null);
                setDraft((current) => ({ ...current, [BILLS[step - 1]]: { ...current[BILLS[step - 1]], ...next } }));
              }}
              onSubmit={continueFromBill}
            />
          ) : (
            <form method="post" noValidate onSubmit={save} className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
              <PreviewLabel className="self-start" />
              <h1 className="font-heading text-h3 font-medium text-navy">{SAFE_TO_SPEND_COPY.setAsideTitle}</h1>
              <p className="text-body-s text-indigo-black">{SAFE_TO_SPEND_COPY.setAsideBody}</p>
              <TextField
                label={SAFE_TO_SPEND_COPY.setAsideLabel}
                hint="Optional"
                inputMode="decimal"
                autoComplete="off"
                placeholder="$0"
                value={setAside}
                onChange={(event) => {
                  setError(null);
                  setSetAside(event.target.value);
                }}
                error={stepError?.field ? stepError.text : undefined}
                disabled={pending}
              />
              <div className="flex-1" />
              {stepError && !stepError.field ? <ErrorMessage>{stepError.text}</ErrorMessage> : null}
              <Button type="submit" pending={pending}>
                See safe to spend
              </Button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

// The app's back control (AppHeader), but replacing the step in history
// rather than adding one.
function StepHeader({ href, label }: { href: string; label: string }) {
  return (
    <header className="box-content flex h-14 items-center px-6 pt-8">
      <Link href={href} replace aria-label={`Back to ${label}`} className={cn(BACK_CONTROL, "focus-visible:outline-ring")}>
        <Image src="/icons/arrow-left-dark.svg" alt="" width={48} height={48} />
      </Link>
    </header>
  );
}

function BillStep({
  step,
  bill,
  answer,
  error,
  onChange,
  onSubmit,
}: {
  step: number;
  bill: Bill;
  answer: { coveredBy: CoveredBy | null; amount: string };
  error: { text: string; field?: boolean } | null;
  onChange: (next: Partial<{ coveredBy: CoveredBy; amount: string }>) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const titleId = useId();
  const copy = BILL_COPY[bill];
  const next = BILLS.slice(step).map((later) => BILL_COPY[later].label);
  return (
    <form method="post" noValidate onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
      <PreviewLabel className="self-start" />
      <p className="text-body-s font-semibold text-violet">
        {copy.label} · {step} of {BILLS.length}
      </p>
      <div className="flex flex-col gap-2">
        <h1 id={titleId} className="font-heading text-h3 font-medium text-navy">
          {copy.question}
        </h1>
        <p className="text-body-s text-indigo-black">{SAFE_TO_SPEND_COPY.familyNote}</p>
      </div>
      {/* Who pays a student's bills is personal: masked in session replay. */}
      <div role="group" aria-labelledby={titleId} className={cn(SENSITIVE, "flex flex-col gap-3")}>
        {COVERED_BY.map((coveredBy) => {
          const selected = answer.coveredBy === coveredBy;
          return (
            <button
              key={coveredBy}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ coveredBy })}
              className={cn(answerCardClass, "min-h-14 rounded-[18px]")}
            >
              <span className="flex-1">{COVERED_BY_LABELS[coveredBy]}</span>
              <SelectionMark selected={selected} />
            </button>
          );
        })}
      </div>
      {paysPart(answer.coveredBy) ? (
        <TextField
          label={answer.coveredBy === "split" ? SHARE_LABEL : copy.amountLabel}
          inputMode="decimal"
          autoComplete="off"
          placeholder="$0"
          value={answer.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          error={error?.field ? error.text : undefined}
        />
      ) : null}
      <div className="flex-1" />
      {error && !error.field ? <ErrorMessage>{error.text}</ErrorMessage> : null}
      <Button type="submit">Continue</Button>
      <p className="text-[13px] leading-[18px] text-indigo-black/75">
        Next: {next.length > 0 ? next.join(", ") : "what to keep aside"}
      </p>
    </form>
  );
}
