import { TIER_LABELS, type FitTier } from "@/lib/copy/results"
import { cn } from "@/lib/utils"

// Not drawn in the hi-fi. Based on the "On track" pill on the home screen
// (28 tall, 8px dot). The words always carry the meaning; color is secondary.
// "Not yet" is neutral, not coral: coral is for errors, and this is not one.
const TIER_STYLE: Record<FitTier, { pill: string; dot: string }> = {
  likely_fit: { pill: "border-green bg-green/30", dot: "bg-green" },
  stretch: { pill: "border-amber bg-amber/30", dot: "bg-amber" },
  not_yet: { pill: "border-off-white bg-off-white/15", dot: "bg-off-white" },
}

function TierBadge({ tier }: { tier: FitTier }) {
  const style = TIER_STYLE[tier]
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 self-start rounded-full border px-2.5 text-label text-foreground",
        style.pill
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", style.dot)} />
      {TIER_LABELS[tier]}
    </span>
  )
}

export { TierBadge }
