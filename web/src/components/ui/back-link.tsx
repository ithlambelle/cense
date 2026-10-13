import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

const backLinkClass =
  "inline-flex h-12 w-24 cursor-pointer items-center justify-center gap-2 rounded-pill text-label text-foreground underline decoration-1 underline-offset-2 outline-none hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

type BackLinkProps =
  | { href: string; onClick?: never; className?: string }
  | { href?: never; onClick: () => void; disabled?: boolean; className?: string }

// The quiz and result version of Back. Figma also has a plain version on the
// sign-in frames; one is used everywhere until the designers pick.
function BackLink(props: BackLinkProps) {
  const { href, onClick, className } = props
  const content = (
    <>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back
    </>
  )
  if (href !== undefined) {
    return (
      <Link href={href} className={cn(backLinkClass, className)}>
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={props.disabled ?? false}
      className={cn(backLinkClass, "disabled:cursor-progress", className)}
    >
      {content}
    </button>
  )
}

export { BackLink }
