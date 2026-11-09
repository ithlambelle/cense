// The one way an amount of money is written for a student, from whole cents:
// thousands separators, and cents only when it is not whole dollars.
// 0 -> "$0", 150000 -> "$1,500", 150050 -> "$1,500.50", 9950 -> "$99.50".
export function moneyAmount(cents: number): string {
  const wholeDollars = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: wholeDollars ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// An amount a student typed, as whole cents, or null when it is not one or is
// outside minCents to maxCents. Takes an optional "$", then plain digits or
// commas every three digits, then up to 2 decimals: "650", "$1,200.50", "40.5".
// "25." is $25, so a field checked on every keystroke does not flag "25.50"
// halfway through. Refuses "12,34" (never $1,234), "1,0000", "-5", "1e3" and words.
const TYPED_DOLLARS = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{0,2}))?$/;

export function dollarsToCents(value: string, { minCents, maxCents }: { minCents: number; maxCents: number }): number | null {
  const match = TYPED_DOLLARS.exec(value.trim());
  if (!match) return null;
  // Built from the digits, never Number("1.15") * 100, which is 114.99999999999999.
  const cents = Number(match[1].replace(/,/g, "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= minCents && cents <= maxCents ? cents : null;
}

// Cents as a student would type them back into a field: no cents when it is
// whole dollars, two digits when it is not. 65000 -> "650", 4050 -> "40.50".
export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
