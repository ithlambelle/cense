import { cn } from "@/lib/utils"

type ProgressSegmentsProps = { current: number; total: number }

// Decorative. Filled and unfilled segments differ by only 1.87 to 1, so the
// text from progressLabel() must always be shown alongside.
function ProgressSegments({ current, total }: ProgressSegmentsProps) {
  return (
    <div aria-hidden="true" className="flex h-1 gap-1">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn("flex-1 rounded-segment", index < current ? "bg-primary" : "bg-track")}
        />
      ))}
    </div>
  )
}

function progressLabel(current: number, total: number): string {
  return `Question ${current} of ${total}`
}

export { ProgressSegments, progressLabel }
