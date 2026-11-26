// Created with Claude Code (2026-11-13). The words of Your money (US-12,
// Figma 709:1520, 709:1769, 709:1865). Kept short: read on a phone, and never
// telling a student what to do.

export const YOUR_MONEY_COPY = {
  title: "Your money",
  tabs: { today: "Today", month: "This month" },
  // Today (709:1520)
  todayLabel: "Safe to spend today:",
  fromBank: "From your bank",
  fromYou: "From you",
  cash: "Cash in checking",
  cards: "Card balances",
  // The set-aside from the safe-to-spend answers, on both tabs (Ben, Nov 14).
  setAside: "Savings goal",
  // Under the savings goal: the way to the goal it is for (Pick a goal).
  setGoal: "Set a goal",
  changeGoal: "Change goal",
  // This month (709:1769, 709:1865)
  leftLabel: "Left over each month:",
  shortLabel: "Short each month by:",
  leftLine: "After needs, wants and saving",
  fixedOverIncome: "Needs and fixed wants are more than income",
  needs: "Needs",
  wants: "Wants",
  saving: "Saving",
  youTyped: "You typed",
  // Not drawn: no transactions synced yet
  noBankData: "No transactions from your bank yet",
  notYet: "Not yet",
  invalidAmount: "Use an amount like 25 or 25.50.",
} as const;

// "Bank numbers are from October." under This month's lines.
export function bankMonthLine(monthName: string): string {
  return `Bank numbers are from ${monthName}.`;
}

// The small undo next to a typed line's amount, as a screen reader says it.
export function bankNumberLabel(label: string): string {
  return `Use the bank's number for ${label}`;
}

// Income with nothing seen in the month.
export function noIncomeLine(monthName: string): string {
  return `None seen in ${monthName}`;
}

// "the 15th"
export function ordinalDay(day: number): string {
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `the ${day}${suffix}`;
}
