import { TIER_LABELS, type FitTier } from "@/lib/copy/results"
import { cn } from "@/lib/utils"

// How well a card fits, as the designers' signal bars plus the tier name
// (Figma G8, 2026-10-24; layers "Fit / Likely fit" 223:1839 and "Fit /
// Stretch" 223:1851). Three Light Green bars for a likely fit; one Amber bar
// of three for a stretch. The status pill is kept for application status
// (Approved, Not approved). A not yet card is never shown as a pick (results
// drop it), so it has no frame: it falls back to three empty bars.
const LIT: Record<FitTier, { count: number; color: string }> = {
  likely_fit: { count: 3, color: "bg-green" },
  stretch: { count: 1, color: "bg-amber" },
  not_yet: { count: 0, color: "" },
}

const BAR_HEIGHTS = ["h-1.5", "h-[9px]", "h-3"]

function FitSignal({ tier, className }: { tier: FitTier; className?: string }) {
  const { count, color } = LIT[tier]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)}>
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {BAR_HEIGHTS.map((height, index) => (
          <span key={height} className={cn("w-1 rounded-[1.5px]", height, index < count ? color : "bg-indigo-black/15")} />
        ))}
      </span>
      {/* Screen readers hear "Fit: Stretch", so the tier never reads as a stray word. */}
      <span className="text-[13px] leading-4 font-semibold whitespace-nowrap text-indigo-black">
        <span className="sr-only">Fit: </span>
        {TIER_LABELS[tier]}
      </span>
    </span>
  )
}

export { FitSignal }
