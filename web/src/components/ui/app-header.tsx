import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

// The one back control for inner screens (Figma G6, 2026-10-23): the
// designers' quiz arrow, flush with the content edge, then the word for where
// it goes ("Home", "Plan", "Your match"). No page title in the header: every
// screen names itself in its own heading (G2). "I always go to the top left
// to go back" (solution interview, 2026-10-17).
function AppHeader({ backHref, backLabel, action }: { backHref: string; backLabel: string; action?: ReactNode }) {
  return (
    <header className="box-content flex h-14 items-center justify-between gap-3 px-6 pt-8">
      <BackLink href={backHref} label={backLabel} />
      {action ? <div className="flex justify-end">{action}</div> : null}
    </header>
  )
}

// Screen readers hear "Back to Home"; the screen shows "Home". The light tone
// is for navy headers (the result screen).
function BackLink({ href, label, tone = "dark" }: { href: string; label: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      // Contains the visible word, so speech users can say what they see (WCAG 2.5.3).
      aria-label={`Back to ${label}`}
      className={
        tone === "dark"
          ? "flex min-h-12 items-center rounded-pill pr-3 text-body-m text-navy outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          : "flex min-h-12 items-center rounded-pill pr-3 text-body-m text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-off-white"
      }
    >
      <Image src={tone === "dark" ? "/icons/arrow-left-dark.svg" : "/icons/arrow-left.svg"} alt="" width={48} height={48} />
      <span aria-hidden="true">{label}</span>
    </Link>
  )
}

export { AppHeader, BackLink }
