"use client";

// Created with Claude Code (2026-11-13). Your money, This month (Figma B1,
// 709:1769, and B2, 709:1865): income, needs, wants and saving from the
// student's last full month, every number editable in place, and the total at
// the top updating as they type. Below zero it says "Short each month by",
// one plain line, no suggestion and no instruction (Ben, Nov 4).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EditRow, GroupHeading, MoneyHero, MoneyTabs } from "@/components/your-money/parts";
import { track } from "@/lib/analytics";
import type { Budget } from "@/lib/api/budget";
import { saveBudgetLine, type BudgetLineKey } from "@/lib/api-client/budget";
import { parseAmount, saveSafeToSpendAnswers, type BillAnswer } from "@/lib/api-client/safe-to-spend";
import { parseDollarsToCents } from "@/lib/budget/amount";
import { bankMonthLine, EDUCATIONAL_DISCLAIMER, noIncomeLine, YOUR_MONEY_COPY } from "@/lib/budget/copy";
import { monthName, summarize, type BudgetLine, type BudgetLines } from "@/lib/budget/lines";
import { centsToInput, moneyAmount } from "@/lib/money";
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
    Object.fromEntries(all.map((line) => [line.key, centsToInput(line.amountCents)])),
  );
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState<string | null>(null);

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

  async function commit(line: BudgetLine) {
    const cents = parseLine(line, values[line.key] ?? "");
    if (cents === null) {
      setErrors((current) => ({ ...current, [line.key]: YOUR_MONEY_COPY.invalidAmount }));
      return;
    }
    setErrors((current) => ({ ...current, [line.key]: undefined }));
    if (cents === line.amountCents || saving) return;
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
    track("money_amount_saved", { tab: "this_month", line: line.group === "saving" ? "set_aside" : line.group });
    setValues((current) => ({ ...current, [line.key]: centsToInput(cents) }));
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

  const row = (line: BudgetLine) => (
    <EditRow
      key={line.key}
      id={`your-money-${line.key}`}
      label={line.label}
      sub={sub(line)}
      fieldLabel={`${line.label} each month`}
      value={values[line.key] ?? ""}
      invalid={errors[line.key] !== undefined}
      error={errors[line.key]}
      pending={saving === line.key}
      onChange={(value) => {
        setValues((current) => ({ ...current, [line.key]: value }));
        if (errors[line.key] && parseLine(line, value) !== null) setErrors((current) => ({ ...current, [line.key]: undefined }));
      }}
      onCommit={() => void commit(line)}
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
      <div className="flex flex-col gap-1 pt-2 text-[13px] leading-[18px] text-indigo-black/70">
        {budget.hasBankData ? <p>{bankMonthLine(month)}</p> : null}
        <p>{EDUCATIONAL_DISCLAIMER}</p>
      </div>
    </>
  );
}
