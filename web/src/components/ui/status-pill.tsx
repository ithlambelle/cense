import type { ReactNode } from "react"

// A short status in capitals on an off-white pill (REJECTED, APPROVED AFTER
// REVIEW), from the Home and second-look frames.
function StatusPill({ children }: { children: ReactNode }) {
  return (
    <p className="shrink-0 rounded-pill bg-off-white px-2.5 py-[5px] text-body-s font-semibold text-violet">{children}</p>
  )
}

export { StatusPill }
