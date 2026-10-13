import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// A line of guidance attached to a card, for example "This card has no credit check to apply."
function NoteLine({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-label text-muted-foreground", className)} {...props} />
}

// The guidance line that every result carries. Its wording is fixed elsewhere.
function Disclaimer({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-center text-label text-muted-foreground", className)} {...props} />
}

export { Disclaimer, NoteLine }
