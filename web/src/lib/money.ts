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
