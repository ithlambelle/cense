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
  // One card: say which, so a student with cards Cense cannot see is not
  // left guessing (persona walk, Nov 25).
  card: "Card balance",
  // The set-aside from the safe-to-spend answers, on both tabs (Ben, Nov 14).
  setAside: "Savings goal",
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

// "Bank numbers are from October." under This month's lines, and why Today's
// daily number is not this one spread out: it starts from the bank balance.
export function bankMonthLine(monthName: string): string {
  return `Bank numbers are from ${monthName}. Safe to spend starts from what’s in checking today.`;
}

// Under a This month line with bills from the safe-to-spend answers that the
// bank did not show: "Includes phone from your answers".
export function fromAnswersLine(labels: string[]): string {
  const words = labels.map((label) => label.toLowerCase());
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `Includes ${list} from your answers`;
}

// Under the one card's balance on Today: "Plaid Credit Card ending in 3333".
export function cardNameLine(name: string, mask: string | null): string {
  return mask ? `${name} ending in ${mask}` : name;
}

// Under the card balances on Today when there is more than one card.
export function cardsTotalLine(count: number): string {
  return `Total of ${count} cards`;
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
