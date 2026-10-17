import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// A line of guidance attached to a card or an action, for example "This check
// won't affect your credit score." Body S in indigo-black.
function NoteLine({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-s text-indigo-black", className)} {...props} />
}

export { NoteLine }
