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

import { amountInput, EditRow, GroupHeading, MoneyHero, MoneyTabs } from "@/components/your-money/parts";
import { track } from "@/lib/analytics";
import type { Budget } from "@/lib/api/budget";
import { deleteBudgetLine, saveBudgetLine, type BudgetLineKey } from "@/lib/api-client/budget";
import { parseAmount, saveSafeToSpendAnswers, type BillAnswer } from "@/lib/api-client/safe-to-spend";
import { parseDollarsToCents } from "@/lib/budget/amount";
import { bankMonthLine, bankNumberLabel, noIncomeLine, YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { monthName, summarize, type BudgetLine, type BudgetLines } from "@/lib/budget/lines";
import { moneyAmount } from "@/lib/money";
import { signInPath, yourMoneyPath } from "@/lib/routes";

// Saving is the set-aside, so it saves with the safe-to-spend answers and
// keeps that screen's range; every other line saves to the budget.
function parseLine(line: BudgetLine, text: string): number | null {
  if (text.trim() === "") return 0;
  return line.group === "saving" ? parseAmount(text) : parseDollarsToCents(text);
}

export function MonthTab({ budget, answers }: { budget: Budget; answers: { bills: BillAnswer[]; setAsideCents: number } }) {
  const router = useRouter();
  const lines = budget as unknown as BudgetLines;
  const all = [lines.income, ...lines.needs, ...lines.wants, lines.saving];
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
  const summary = summarize(lines, typedAmounts);
  const short = summary.remainingCents < 0;
  const month = monthName(budget.month);
  // Not drawn: linked, but no transactions have arrived and nothing is typed
  // yet. No total to show until there is something to add up.
  const waiting = !budget.hasBankData && !lines.income.typed && lines.needs.length === 0 && lines.wants.length === 0;

  // Saves run one after another, each with the field as it is when it runs,
  // so a quick second edit is never dropped.
  const latest = useRef(values);
  const lastSaved = useRef<Record<string, number>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());

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
    queue.current = queue.current.then(() => save(line));
  }

  async function save(line: BudgetLine) {
    const cents = parseLine(line, latest.current[line.key] ?? "");
    if (cents === null || cents === (lastSaved.current[line.key] ?? line.amountCents)) return;
    setSaving(line.key);
    const result =
      line.group === "saving"
        ? await saveSafeToSpendAnswers({ bills: answers.bills, setAsideCents: cents })
        : await saveBudgetLine(line.key as BudgetLineKey, cents);
    setSaving(null);
    if (result.kind === "signed-out") return router.replace(signInPath(yourMoneyPath("month")));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [line.key]: result.message }));
      return;
    }
    lastSaved.current[line.key] = cents;
    track("money_amount_saved", { tab: "this_month", line: line.group === "saving" ? "set_aside" : line.group });
    router.refresh();
  }

  // Back to the bank's number: the student's own is deleted. In the same
  // queue as the saves, so it runs after any save still on its way and
  // cannot be overwritten by one.
  function undo(line: BudgetLine) {
    setErrors((current) => ({ ...current, [line.key]: undefined }));
    setUndoing(line.key);
    queue.current = queue.current.then(() => runUndo(line));
  }

  async function runUndo(line: BudgetLine) {
    const result = await deleteBudgetLine(line.key as BudgetLineKey);
    setUndoing(null);
    if (result.kind === "signed-out") return router.replace(signInPath(yourMoneyPath("month")));
    if (result.kind === "failed") {
      setErrors((current) => ({ ...current, [line.key]: result.message }));
      return;
    }
    const bankCents = line.bankCents ?? 0;
    lastSaved.current[line.key] = bankCents;
    setValue(line.key, amountInput(bankCents));
    router.refresh();
  }

  // The quiet line under a label. "Fixed" and "Changing" (and "looks like
  // pay" on income) come from the recurring detector (#109) and slot in here.
  function sub(line: BudgetLine): string | null {
    if (line.typed) return YOUR_MONEY_COPY.youTyped;
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
      {group("saving", YOUR_MONEY_COPY.saving, [{ ...lines.saving, label: YOUR_MONEY_COPY.setAside }])}
      {budget.hasBankData ? <p className="pt-2 text-[13px] leading-[18px] text-indigo-black/70">{bankMonthLine(month)}</p> : null}
    </>
  );
}
