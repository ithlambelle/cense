"use client";

// Created with Claude Code (2026-11-13). Your money, This month (Figma B1,
// 709:1769, and B2, 709:1865): income, needs, wants and saving from the
// student's last full month, every number editable in place, and the total at
// the top updating as they type. Below zero it says "Short each month by",
// one plain line, no suggestion and no instruction (Ben, Nov 4). A line the
// student typed over the bank's has a small undo that brings the bank's
// number back (Ben, Nov 14).
import ArrowUturnCcwLeft from "@gravity-ui/icons/ArrowUturnCcwLeft";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { amountInput, EditRow, GroupHeading, MoneyHero, MoneyTabs, type SharedAnswers } from "@/components/your-money/parts";
import { track } from "@/lib/analytics";
import type { Budget } from "@/lib/api/budget";
import { deleteBudgetLine, saveBudgetLine, type BudgetLineKey } from "@/lib/api-client/budget";
import { parseAmount, saveSafeToSpendAnswers } from "@/lib/api-client/safe-to-spend";
import { parseDollarsToCents } from "@/lib/budget/amount";
import { bankMonthLine, bankNumberLabel, fromAnswersLine, noIncomeLine, YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { monthName, summarize, untypedCents, type BudgetLine, type BudgetLines } from "@/lib/budget/lines";
import { moneyAmount } from "@/lib/money";
import { ROUTES, signInPath } from "@/lib/routes";
import { BILL_COPY } from "@/lib/safe-to-spend/copy";

// Saving is the set-aside, so it saves with the safe-to-spend answers and
// keeps that screen's range; every other line saves to the budget.
function parseLine(line: BudgetLine, text: string): number | null {
  if (text.trim() === "") return 0;
  return line.group === "saving" ? parseAmount(text) : parseDollarsToCents(text);
}

// `shared` holds the bills and savings goal for both tabs (YourMoneyView):
// saving is the savings goal, so it shows and saves the shared copy, never
// an older one from before a save on Today.
export function MonthTab({ budget, shared }: { budget: Budget; shared: SharedAnswers }) {
  const router = useRouter();
  // Bills from the answers and the savings goal follow the shared copy too,
  // so a bill changed on Today shows here even before the page reloads.
  const fromShared = (line: BudgetLine): BudgetLine => {
    if (line.answers.length === 0) return line;
    const answers = line.answers.map((entry) => ({
      ...entry,
      amountCents: shared.answers.bills.find((answer) => answer.bill === entry.bill)?.monthlyCents ?? entry.amountCents,
    }));
    return { ...line, answers, amountCents: line.typed ? line.amountCents : untypedCents({ bankCents: line.bankCents, answers }) };
  };
  const budgetLines = budget as unknown as BudgetLines;
  const lines: BudgetLines = { ...budgetLines, needs: budgetLines.needs.map(fromShared), wants: budgetLines.wants.map(fromShared) };
  const savingLine: BudgetLine = { ...lines.saving, amountCents: shared.answers.setAsideCents, typed: shared.answers.setAsideCents > 0 };
  const all = [lines.income, ...lines.needs, ...lines.wants, savingLine];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map((line) => [line.key, amountInput(line.amountCents)])),
  );
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    track("your_money_viewed", { tab: "this_month" });
  }, []);

  // The total as the student types; a field that is not an amount keeps its saved number.
  const typedAmounts: Record<string, number> = {};
  for (const line of all) {
    const cents = parseLine(line, values[line.key] ?? "");
    if (cents !== null) typedAmounts[line.key] = cents;
  }
  const summary = summarize({ ...lines, saving: savingLine }, typedAmounts);
  const short = summary.remainingCents < 0;
  const month = monthName(budget.month);
  // Not drawn: linked, but no transactions have arrived and nothing is typed
  // yet. No total to show until there is something to add up.
  const waiting = !budget.hasBankData && !lines.income.typed && lines.needs.length === 0 && lines.wants.length === 0;

  // Saves run one after another in the page's queue, each with the field as
  // it is when it runs, so a quick second edit is never dropped.
  const latest = useRef(values);
  const lastSaved = useRef<Record<string, number>>({});
  const savedCents = (line: BudgetLine) =>
    line.group === "saving" ? shared.latest().setAsideCents : (lastSaved.current[line.key] ?? line.amountCents);

  function setValue(key: string, value: string) {
    latest.current = { ...latest.current, [key]: value };
    setValues(latest.current);
  }

  function commit(line: BudgetLine) {
    if (parseLine(line, latest.current[line.key] ?? "") === null) {
      setErrors((current) => ({ ...current, [line.key]: YOUR_MONEY_COPY.invalidAmount }));
      return;
    }
    setErrors((current) => ({ ...current, [line.key]: undefined }));
    void shared.enqueue(() => save(line));
  }

  async function save(line: BudgetLine) {
    const cents = parseLine(line, latest.current[line.key] ?? "");
    if (cents === null || cents === savedCents(line)) return;
    setSaving(line.key);
    const answers = { bills: shared.latest().bills, setAsideCents: cents };
    const result =
      line.group === "saving" ? await saveSafeToSpendAnswers(answers) : await saveBudgetLine(line.key as BudgetLineKey, cents);
    setSaving(null);
    if (result.kind === "ok" && line.group === "saving") shared.saved(answers);
    // Your money, not ?tab=month: sign-in only goes back to plain paths.
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [line.key]: result.message }));
      return;
    }
    lastSaved.current[line.key] = cents;
    setErrors((current) => ({ ...current, [line.key]: undefined }));
    track("money_amount_saved", { tab: "this_month", line: line.group === "saving" ? "set_aside" : line.group });
    router.refresh();
  }

  // Back to the bank's number: the student's own is deleted. In the same
  // queue as the saves, so it runs after any save still on its way and
  // cannot be overwritten by one.
  function undo(line: BudgetLine) {
    setErrors((current) => ({ ...current, [line.key]: undefined }));
    setUndoing(line.key);
    // What the field held when undo was tapped: anything typed after it is
    // the student's newer number and is kept (and saved on blur).
    const tapped = latest.current[line.key];
    void shared.enqueue(() => runUndo(line, tapped));
  }

  async function runUndo(line: BudgetLine, tapped: string | undefined) {
    const result = await deleteBudgetLine(line.key as BudgetLineKey);
    setUndoing(null);
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [line.key]: result.message }));
      return;
    }
    const untyped = untypedCents(line);
    lastSaved.current[line.key] = untyped;
    if (latest.current[line.key] === tapped) setValue(line.key, amountInput(untyped));
    router.refresh();
  }

  // The quiet line under a label: where a number came from when it is not the
  // bank's (the bank's are named once, under the lines). "Fixed" and
  // "Changing" (and "looks like pay" on income) come from the recurring
  // detector (#109) and slot in here.
  function sub(line: BudgetLine): string | null {
    if (line.typed) return YOUR_MONEY_COPY.youTyped;
    if (line.answers.length > 0) return fromAnswersLine(line.answers.map((entry) => BILL_COPY[entry.bill].label));
    if (line.group === "income" && line.bankCents === null) return noIncomeLine(month);
    if (line.recurrence) return line.recurrence === "recurring" ? "Fixed" : "Changing";
    return null;
  }

  // Only income and the categories: saving is the safe-to-spend answer, with
  // no bank number to go back to.
  const undoButton = (line: BudgetLine) =>
    line.typed && line.group !== "saving" ? (
      <button
        type="button"
        aria-label={bankNumberLabel(line.label)}
        disabled={undoing === line.key}
        onClick={() => undo(line)}
        className="-my-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-pill text-indigo-black/70 hover:bg-off-white hover:text-indigo-black focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <ArrowUturnCcwLeft aria-hidden="true" width={16} height={16} />
      </button>
    ) : null;

  const row = (line: BudgetLine) => (
    <EditRow
      key={line.key}
      id={`your-money-${line.key}`}
      label={line.label}
      sub={sub(line)}
      fieldLabel={line.group === "saving" ? line.label : `${line.label} each month`}
      value={values[line.key] ?? ""}
      invalid={errors[line.key] !== undefined}
      error={errors[line.key]}
      pending={saving === line.key || undoing === line.key}
      action={undoButton(line)}
      onChange={(value) => {
        setValue(line.key, value);
        if (errors[line.key] && parseLine(line, value) !== null) setErrors((current) => ({ ...current, [line.key]: undefined }));
      }}
      onCommit={() => commit(line)}
    />
  );

  const group = (id: string, heading: string, entries: BudgetLine[]) =>
    entries.length === 0 ? null : (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <GroupHeading id={id}>{heading}</GroupHeading>
        <ul aria-labelledby={id} className="flex flex-col gap-2">
          {entries.map(row)}
        </ul>
      </section>
    );

  return (
    <>
      {waiting ? (
        <MoneyHero
          label={YOUR_MONEY_COPY.leftLabel}
          amount={<span className="text-[20px] leading-7">{YOUR_MONEY_COPY.notYet}</span>}
          left={YOUR_MONEY_COPY.noBankData}
        />
      ) : (
        <MoneyHero
          label={short ? YOUR_MONEY_COPY.shortLabel : YOUR_MONEY_COPY.leftLabel}
          amount={moneyAmount(short ? summary.shortfallCents : summary.remainingCents)}
          left={short && summary.fixedOverIncome ? YOUR_MONEY_COPY.fixedOverIncome : YOUR_MONEY_COPY.leftLine}
        />
      )}
      <MoneyTabs active="month" />
      <ul aria-label="Income" className="flex flex-col">
        {row(lines.income)}
      </ul>
      {group("needs", YOUR_MONEY_COPY.needs, lines.needs)}
      {group("wants", YOUR_MONEY_COPY.wants, lines.wants)}
      {group("saving", YOUR_MONEY_COPY.saving, [{ ...savingLine, label: YOUR_MONEY_COPY.setAside }])}
      {budget.hasBankData ? <p className="pt-2 text-[13px] leading-[18px] text-indigo-black/70">{bankMonthLine(month)}</p> : null}
    </>
  );
}
