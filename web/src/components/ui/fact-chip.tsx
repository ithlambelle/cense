import { cn } from "@/lib/utils"

// One fact about a card, for example "Annual fee / $0", from the result frame
// (397:822): violet 15% fill, Inter label, Unbounded value. Use inside a <dl>.
// className lets a row of boxes share the width, as on the card page (144:2908).
function FactChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-[108px] flex-col rounded-[9px] bg-violet/15 p-[5px]", className)}>
      <dt className="text-body-s text-indigo-black/70">{label}</dt>
      <dd className="font-number text-number-m font-medium text-indigo-black">{value}</dd>
    </div>
  )
}

export { FactChip }
