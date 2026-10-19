import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// A short status in capitals on an off-white pill (REJECTED, APPROVED AFTER
// REVIEW), from the Home and second-look frames.
function StatusPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("shrink-0 rounded-pill bg-off-white px-2.5 py-[5px] text-body-s font-semibold text-violet", className)}>{children}</p>
  )
}

export { StatusPill }
