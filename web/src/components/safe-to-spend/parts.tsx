import { moneyAmount } from "@/lib/money";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { cn } from "@/lib/utils";

// The "Preview" status label (Figma 134:583): text only, never in a pill.
// Design draws it light blue, which is for navy surfaces; on white that is
// about 1.3 to 1, so there it takes the gray of the Sample label (134:581).
export function PreviewLabel({ onNavy = false, className }: { onNavy?: boolean; className?: string }) {
  return (
    <span className={cn("shrink-0 text-[13px] leading-5 font-semibold", onNavy ? "text-light-blue" : "text-indigo-black/70", className)}>
      {SAFE_TO_SPEND_COPY.preview}
    </span>
  );
}

// An amount taken away in the sum: "−$310". A true minus sign, which screen
// readers say as "minus".
export function minusMoney(cents: number): string {
  return `−${moneyAmount(Math.abs(cents))}`;
}

// An amount that can be below zero, such as what is left.
export function signedMoney(cents: number): string {
  return cents < 0 ? minusMoney(cents) : moneyAmount(cents);
}
