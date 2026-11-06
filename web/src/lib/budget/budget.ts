// The budget waterfall from the advising template, as plain functions.
// Synthetic data only for now: nothing here reads a student's real accounts,
// and nothing is saved or sent anywhere. All amounts are whole cents, like
// money.ts.
//
// The order is the template's:
//   income
//   minus recurring needs, then variable needs, then recurring wants
//   = the surplus the student decides how to use
//   minus variable wants and savings goals (their choices)
//   = what is left, or the shortfall when it is negative.
//
// This is arithmetic on numbers the student gave. It never says what they
// should do with the surplus.

export type PayCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type Necessity = "need" | "want";
export type Recurrence = "recurring" | "variable";

export type Income = { amountCents: number; cadence: PayCadence };

export type Expense = {
  id: string;
  label: string;
  necessity: Necessity;
  recurrence: Recurrence;
  monthlyCents: number;
};

export type SavingsGoal = {
  id: string;
  label: string;
  monthlyCents: number;
};

export type BudgetInput = {
  income: Income;
  expenses: Expense[];
  savings: SavingsGoal[];
};

export type BudgetResult = {
  incomeCents: number;
  recurringNeedsCents: number;
  variableNeedsCents: number;
  recurringWantsCents: number;
  // Income minus recurring needs, variable needs and recurring wants.
  // Negative when the fixed costs alone are more than the income.
  surplusCents: number;
  variableWantsCents: number;
  savingsCents: number;
  // Surplus minus variable wants and savings. Negative is a shortfall.
  remainingCents: number;
  shortfallCents: number;
};

export const PAYCHECKS_PER_YEAR: Record<PayCadence, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

function assertCents(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole number of cents, 0 or more`);
  }
}

// What one paycheck's worth of income is in a month, rounded to the cent.
// Weekly pay is 52 paychecks a year, so a month is 52/12 of one, not 4.
export function monthlyFromIncome(income: Income): number {
  assertCents(income.amountCents, "income");
  return Math.round(
    (income.amountCents * PAYCHECKS_PER_YEAR[income.cadence]) / 12,
  );
}

// A monthly amount as it falls on each paycheck, rounded to the cent. The
// rounded paychecks can differ from the monthly figure by a few cents over a
// year, which is why the app should say "about" next to these.
export function perPaycheck(monthlyCents: number, cadence: PayCadence): number {
  assertCents(monthlyCents, "amount");
  return Math.round((monthlyCents * 12) / PAYCHECKS_PER_YEAR[cadence]);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function total(
  expenses: Expense[],
  necessity: Necessity,
  recurrence: Recurrence,
): number {
  return sum(
    expenses
      .filter(
        (expense) =>
          expense.necessity === necessity && expense.recurrence === recurrence,
      )
      .map((expense) => {
        assertCents(expense.monthlyCents, expense.label);
        return expense.monthlyCents;
      }),
  );
}

export function computeBudget(input: BudgetInput): BudgetResult {
  const incomeCents = monthlyFromIncome(input.income);
  const recurringNeedsCents = total(input.expenses, "need", "recurring");
  const variableNeedsCents = total(input.expenses, "need", "variable");
  const recurringWantsCents = total(input.expenses, "want", "recurring");
  const variableWantsCents = total(input.expenses, "want", "variable");
  const savingsCents = sum(
    input.savings.map((goal) => {
      assertCents(goal.monthlyCents, goal.label);
      return goal.monthlyCents;
    }),
  );

  const surplusCents =
    incomeCents - recurringNeedsCents - variableNeedsCents - recurringWantsCents;
  const remainingCents = surplusCents - variableWantsCents - savingsCents;

  return {
    incomeCents,
    recurringNeedsCents,
    variableNeedsCents,
    recurringWantsCents,
    surplusCents,
    variableWantsCents,
    savingsCents,
    remainingCents,
    shortfallCents: Math.max(0, -remainingCents),
  };
}

// The template's "reduce a want" tradeoff: the same budget with one expense
// or goal changed to a new monthly amount, so the screen can show both sides
// of the choice. It does not mutate the input.
export function withMonthlyAmount(
  input: BudgetInput,
  id: string,
  monthlyCents: number,
): BudgetInput {
  assertCents(monthlyCents, "amount");
  return {
    ...input,
    expenses: input.expenses.map((expense) =>
      expense.id === id ? { ...expense, monthlyCents } : expense,
    ),
    savings: input.savings.map((goal) =>
      goal.id === id ? { ...goal, monthlyCents } : goal,
    ),
  };
}
