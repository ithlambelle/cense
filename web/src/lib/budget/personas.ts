// Made-up students for building and testing the budget screens. None of this
// is real student data. Amounts are whole cents.
//
// The advising template's own example does not add up (about $1,200 a month
// over budget on $150 a week), so these two are built to show the two cases
// the screen has to handle: money left over, and not enough.

import type { BudgetInput } from "./budget";

const dollars = (amount: number) => amount * 100;

// Weekly pay of $480 is about $2,080 a month. Needs and recurring wants leave
// a surplus of $858, and the student's own choices leave $238.
export const SAM_WITH_SURPLUS: BudgetInput = {
  income: { amountCents: dollars(480), cadence: "weekly" },
  expenses: [
    { id: "rent", label: "Rent", necessity: "need", recurrence: "recurring", monthlyCents: dollars(700) },
    { id: "insurance", label: "Insurance", necessity: "need", recurrence: "recurring", monthlyCents: dollars(40) },
    { id: "phone", label: "Phone bill", necessity: "need", recurrence: "recurring", monthlyCents: dollars(100) },
    { id: "spotify", label: "Spotify", necessity: "want", recurrence: "recurring", monthlyCents: dollars(12) },
    { id: "disney", label: "Disney+", necessity: "want", recurrence: "recurring", monthlyCents: dollars(20) },
    { id: "groceries", label: "Groceries", necessity: "need", recurrence: "variable", monthlyCents: dollars(300) },
    { id: "gas", label: "Gas", necessity: "need", recurrence: "variable", monthlyCents: dollars(50) },
    { id: "eating-out", label: "Eating out with friends", necessity: "want", recurrence: "variable", monthlyCents: dollars(200) },
    { id: "work-lunch", label: "Buying lunch at work", necessity: "want", recurrence: "variable", monthlyCents: dollars(70) },
  ],
  savings: [
    { id: "investing", label: "Investing", monthlyCents: dollars(200) },
    { id: "savings", label: "Savings account", monthlyCents: dollars(100) },
    { id: "emergency", label: "Emergency fund", monthlyCents: dollars(50) },
  ],
};

// $150 a week is about $650 a month, which rent, insurance, phone and
// groceries alone pass. The fixed costs are already more than the income, so
// there is no surplus to allocate and the screen has to say so plainly.
export const JORDAN_OVER_BUDGET: BudgetInput = {
  income: { amountCents: dollars(150), cadence: "weekly" },
  expenses: [
    { id: "rent", label: "Rent", necessity: "need", recurrence: "recurring", monthlyCents: dollars(700) },
    { id: "insurance", label: "Insurance", necessity: "need", recurrence: "recurring", monthlyCents: dollars(40) },
    { id: "phone", label: "Phone bill", necessity: "need", recurrence: "recurring", monthlyCents: dollars(100) },
    { id: "groceries", label: "Groceries", necessity: "need", recurrence: "variable", monthlyCents: dollars(300) },
    { id: "gas", label: "Gas", necessity: "need", recurrence: "variable", monthlyCents: dollars(50) },
    { id: "spotify", label: "Spotify", necessity: "want", recurrence: "recurring", monthlyCents: dollars(12) },
  ],
  savings: [{ id: "emergency", label: "Emergency fund", monthlyCents: dollars(50) }],
};
