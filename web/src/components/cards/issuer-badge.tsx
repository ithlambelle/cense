import { issuerStyle } from "@/lib/cards/issuers";
import { cn } from "@/lib/utils";

// The issuer's mark in its brand color (see issuers.ts). Decorative: the
// issuer's name is always written next to it.
export function IssuerBadge({ brand, className }: { brand: string; className?: string }) {
  const { mark, background, color } = issuerStyle(brand);
  return (
    <span
      aria-hidden="true"
      style={{ background, color }}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-[12px] font-heading font-semibold tracking-tight",
        mark.length >= 4 ? "text-[11px]" : mark.length === 3 ? "text-[13px]" : "text-body-m",
        className,
      )}
    >
      {mark}
    </span>
  );
}
