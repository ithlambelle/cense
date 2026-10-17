import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// An error under a form or a list. The frames draw error text in coral, but
// coral (#FF6370) on white is about 2.9 to 1, under the 4.5 to 1 WCAG AA needs
// for text. So the text is indigo-black and coral marks it instead.
function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 text-body-s text-indigo-black", className)}>
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-coral" />
      <span>{children}</span>
    </p>
  )
}

export { ErrorMessage }
