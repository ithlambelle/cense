"use client";

import { useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { NoteLine } from "@/components/ui/note";
import { TextField } from "@/components/ui/text-field";
import {
  computeBudget,
  perPaycheck,
  withMonthlyAmount,
  type BudgetInput,
  type Expense,
  type PayCadence,
} from "@/lib/budget/budget";
import { dollarsInput, parseDollarsToCents } from "@/lib/budget/amount";
import { moneyAmount } from "@/lib/money";

// The budget waterfall on made-up numbers, for design review. Everything is
// held in memory: nothing typed here is saved or sent anywhere. It only does
// the arithmetic on what the student enters. It does not say what to do with
// what is left (see the Penny decision about recommendations).

const INCOME_ID = "income";

// Until the team can legally make recommendations (Ben, 2026-10-30), every
// budget screen is education and general information, never advice made for
// one student. The first half is the phrase the Learn topics, Penny and the
// results screen already use. The second half says what this screen does.
export const BUDGET_DISCLAIMER = "Educational, not financial advice. This only adds up the numbers you enter.";

const CADENCES: { id: PayCadence; label: string; per: string | null }[] = [
  { id: "weekly", label: "Every week", per: "a week" },
  { id: "biweekly", label: "Every two weeks", per: "every two weeks" },
  { id: "semimonthly", label: "Twice a month", per: "each paycheck" },
  { id: "monthly", label: "Once a month", per: null },
];

const EXPENSE_GROUPS: {
  title: string;
  hint: string;
  necessity: Expense["necessity"];
  recurrence: Expense["recurrence"];
}[] = [
  { title: "Fixed needs", hint: "Bills that stay the same each month.", necessity: "need", recurrence: "recurring" },
  { title: "Changing needs", hint: "Needs that move around, like groceries.", necessity: "need", recurrence: "variable" },
  { title: "Fixed wants", hint: "Subscriptions and extras that stay the same.", necessity: "want", recurrence: "recurring" },
  { title: "Changing wants", hint: "Extras that move around, like eating out.", necessity: "want", recurrence: "variable" },
];

const AMOUNT_ERROR = "Use an amount like 25 or 25.50.";

// A negative amount reads "-$120", never "$-120".
function signed(cents: number): string {
  return cents < 0 ? `-${moneyAmount(-cents)}` : moneyAmount(cents);
}

function startingTexts(input: BudgetInput): Record<string, string> {
  const texts: Record<string, string> = { [INCOME_ID]: dollarsInput(input.income.amountCents) };
  for (const expense of input.expenses) texts[expense.id] = dollarsInput(expense.monthlyCents);
  for (const goal of input.savings) texts[goal.id] = dollarsInput(goal.monthlyCents);
  return texts;
}

export function BudgetView({ initial, personaName }: { initial: BudgetInput; personaName: string }) {
  const [input, setInput] = useState(initial);
  const [texts, setTexts] = useState(() => startingTexts(initial));

  // An empty field counts as $0. Text that is not an amount is flagged, and
  // until it is fixed the total is not shown, so a wrong number never shows
  // as if it were right.
  const invalid = new Set(Object.keys(texts).filter((id) => texts[id].trim() !== "" && parseDollarsToCents(texts[id]) === null));

  function edit(id: string, text: string) {
    setTexts((current) => ({ ...current, [id]: text }));
    const cents = text.trim() === "" ? 0 : parseDollarsToCents(text);
    if (cents === null) return;
    setInput((current) =>
      id === INCOME_ID ? { ...current, income: { ...current.income, amountCents: cents } } : withMonthlyAmount(current, id, cents),
    );
  }

  function reset() {
    setInput(initial);
    setTexts(startingTexts(initial));
  }

  const result = computeBudget(input);
  const cadence = CADENCES.find((entry) => entry.id === input.income.cadence)!;
  const remaining = result.remainingCents;
  // "About" means whole dollars: "about $55 a week", not "about $54.92".
  const perPay = cadence.per ? Math.round(perPaycheck(Math.abs(remaining), input.income.cadence) / 100) * 100 : null;

  const rows: { label: string; cents: number; strong?: boolean }[] = [
    { label: "Income", cents: result.incomeCents },
    { label: "Minus fixed needs", cents: result.recurringNeedsCents },
    { label: "Minus changing needs", cents: result.variableNeedsCents },
    { label: "Minus fixed wants", cents: result.recurringWantsCents },
    { label: "Left to decide", cents: result.surplusCents, strong: true },
    { label: "Minus changing wants", cents: result.variableWantsCents },
    { label: "Minus saving", cents: result.savingsCents },
    // "Short" already says it is below zero, so show the amount without a minus.
    { label: remaining < 0 ? "Short" : "Left over", cents: Math.abs(remaining), strong: true },
  ];

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref="/dev/screens" backLabel="All screens" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">Your month</h1>
            <p className="text-body-m text-indigo-black">
              Made-up numbers for {personaName}. Change any amount to see what it does. Amounts are dollars a month, and nothing here is saved.
            </p>
            <NoteLine>{BUDGET_DISCLAIMER}</NoteLine>
          </div>

          <div role="status" className="flex flex-col gap-1 rounded-card bg-off-white p-4">
            {invalid.size > 0 ? (
              <p className="text-body-m text-indigo-black">Fix the amounts marked below to see your total.</p>
            ) : (
              <>
                <p className="text-body-s text-indigo-black">{remaining < 0 ? "Short each month by" : "Left over each month"}</p>
                <p className="font-heading text-h1 font-medium text-navy tabular-nums">{moneyAmount(Math.abs(remaining))}</p>
                {perPay !== null && perPay > 0 ? (
                  <p className="text-body-s text-indigo-black">
                    That is about {moneyAmount(perPay)} {cadence.per}
                    {remaining < 0 ? " short" : ""}.
                  </p>
                ) : null}
                {result.surplusCents < 0 ? (
                  <p className="text-body-s text-indigo-black">Your needs and fixed wants alone are more than your income.</p>
                ) : null}
              </>
            )}
          </div>

          <section aria-labelledby="income-heading" className="flex flex-col gap-3">
            <h2 id="income-heading" className="font-heading text-h4 font-medium text-navy">
              Income
            </h2>
            <TextField
              label="Pay each paycheck"
              inputMode="decimal"
              autoComplete="off"
              value={texts[INCOME_ID]}
              onChange={(event) => edit(INCOME_ID, event.target.value)}
              error={invalid.has(INCOME_ID) ? AMOUNT_ERROR : undefined}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="cadence" className="text-body-s text-indigo-black">
                How often you are paid
              </label>
              <div className="flex h-12 items-center rounded-input border-[1.5px] border-off-white bg-off-white pr-2 pl-3.5 focus-within:border-violet">
                <select
                  id="cadence"
                  value={input.income.cadence}
                  onChange={(event) =>
                    setInput((current) => ({ ...current, income: { ...current.income, cadence: event.target.value as PayCadence } }))
                  }
                  className="h-full min-w-0 flex-1 bg-transparent text-body-m text-indigo-black outline-none"
                >
                  {CADENCES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {EXPENSE_GROUPS.map((group) => {
            const items = input.expenses.filter((e) => e.necessity === group.necessity && e.recurrence === group.recurrence);
            return (
              <AmountGroup
                key={group.title}
                title={group.title}
                hint={group.hint}
                items={items}
                texts={texts}
                invalid={invalid}
                onEdit={edit}
              />
            );
          })}
          <AmountGroup
            title="Saving"
            hint="Money you set aside each month."
            items={input.savings}
            texts={texts}
            invalid={invalid}
            onEdit={edit}
          />

          <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
            <h2 id="steps-heading" className="font-heading text-h4 font-medium text-navy">
              How it adds up
            </h2>
            <dl className="flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className={`flex justify-between gap-4 border-b border-hairline py-2 ${row.strong ? "font-semibold text-navy" : "text-indigo-black"}`}
                >
                  <dt className="text-body-m">{row.label}</dt>
                  <dd className="text-body-m tabular-nums">{invalid.size > 0 ? "..." : signed(row.cents)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Button type="button" variant="secondary" onClick={reset}>
            Reset to the example
          </Button>
        </main>
      </div>
    </div>
  );
}

function AmountGroup({
  title,
  hint,
  items,
  texts,
  invalid,
  onEdit,
}: {
  title: string;
  hint: string;
  items: { id: string; label: string }[];
  texts: Record<string, string>;
  invalid: Set<string>;
  onEdit: (id: string, text: string) => void;
}) {
  if (items.length === 0) return null;
  const headingId = `group-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-h4 font-medium text-navy">
          {title}
        </h2>
        <p className="text-body-s text-indigo-black/70">{hint}</p>
      </div>
      {items.map((item) => (
        <TextField
          key={item.id}
          label={item.label}
          inputMode="decimal"
          autoComplete="off"
          value={texts[item.id]}
          onChange={(event) => onEdit(item.id, event.target.value)}
          error={invalid.has(item.id) ? AMOUNT_ERROR : undefined}
        />
      ))}
    </section>
  );
}
