import { cn } from "@/lib/utils"

type ProgressBarProps = { current: number; total: number; className?: string }

// The quiz progress bar from the newest frames: a violet part for questions
// reached and an off-white part for the rest, 4px apart. Decorative: the
// "Question N of 6" text next to it carries the same information.
function ProgressBar({ current, total, className }: ProgressBarProps) {
  const done = Math.min(Math.max(current, 0), total)
  // Both parts stay mounted, an empty one at zero width, so a step slides.
  const part = "rounded-segment transition-[flex-grow] duration-500 ease-out-soft motion-reduce:transition-none"
  return (
    <div aria-hidden="true" className={cn("flex h-1", className)}>
      <span className={cn(part, "bg-violet", done < total && "mr-1")} style={{ flexGrow: done }} />
      <span className={cn(part, "bg-off-white")} style={{ flexGrow: total - done }} />
    </div>
  )
}

export { ProgressBar }
