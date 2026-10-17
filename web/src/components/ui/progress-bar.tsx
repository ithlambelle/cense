import { cn } from "@/lib/utils"

type ProgressBarProps = { current: number; total: number; className?: string }

// The quiz progress bar from the newest frames: a violet part for questions
// reached and an off-white part for the rest, 4px apart. Decorative: the
// "Question N of 6" text next to it carries the same information.
function ProgressBar({ current, total, className }: ProgressBarProps) {
  const done = Math.min(Math.max(current, 0), total)
  return (
    <div aria-hidden="true" className={cn("flex h-1 gap-1", className)}>
      {done > 0 ? <span className="rounded-segment bg-violet" style={{ flexGrow: done }} /> : null}
      {done < total ? <span className="rounded-segment bg-off-white" style={{ flexGrow: total - done }} /> : null}
    </div>
  )
}

export { ProgressBar }
