import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type ScreenShellProps = {
  children: ReactNode
  // Stays visible at the bottom while the content above scrolls. Figma pins
  // Continue to an 844-tall frame; on a shorter phone that would cover options.
  footer?: ReactNode
  // The bottom bar, on signed-in screens that have one.
  nav?: ReactNode
  className?: string
}

function ScreenShell({ children, footer, nav, className }: ScreenShellProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <main className={cn("flex flex-1 flex-col px-6 pt-8 pb-6", className)}>{children}</main>
        {footer || nav ? (
          <div className="sticky bottom-0 bg-background">
            {footer ? (
              <div
                className={cn(
                  "flex flex-col gap-3 px-6 pt-3",
                  nav ? "pb-3" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                )}
              >
                {footer}
              </div>
            ) : null}
            {nav}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { ScreenShell }
