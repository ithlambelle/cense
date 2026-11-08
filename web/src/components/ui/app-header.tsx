import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

// The one back control (Figma G6, revised 2026-10-24): the designers' quiz
// arrow in a 48 box, Indigo-black 70%, flush with the content edge, and no
// destination word on screen. No page title in the header either: every
// screen names itself in its own heading (G2). "I always go to the top left
// to go back" (solution interview, 2026-10-17).
// `replace` swaps the current history entry instead of adding one (Global G1,
// Figma 477:961): Back from a screen reached by Save or Cancel never reopens
// the form behind it.
function AppHeader({ backHref, backLabel, replace = false }: { backHref: string; backLabel: string; replace?: boolean }) {
  return (
    <header className="box-content flex h-14 items-center px-6 pt-8">
      <BackLink href={backHref} label={backLabel} replace={replace} />
    </header>
  )
}

// Shared with the auth screens' Back button, so every back control looks the same.
const BACK_CONTROL =
  "flex size-12 shrink-0 items-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"

// `label` is where it goes. The screen shows only the arrow; screen readers
// hear "Back to Home". The light tone is for navy headers (the result screen).
function BackLink({
  href,
  label,
  tone = "dark",
  replace = false,
}: {
  href: string
  label: string
  tone?: "dark" | "light"
  replace?: boolean
}) {
  return (
    <Link
      href={href}
      replace={replace}
      aria-label={`Back to ${label}`}
      className={cn(BACK_CONTROL, tone === "dark" ? "focus-visible:outline-ring" : "focus-visible:outline-off-white")}
    >
      <Image src={tone === "dark" ? "/icons/arrow-left-dark.svg" : "/icons/arrow-left.svg"} alt="" width={48} height={48} />
    </Link>
  )
}

export { AppHeader, BACK_CONTROL, BackLink }
