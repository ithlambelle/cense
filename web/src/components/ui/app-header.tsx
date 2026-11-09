"use client"

import Image from "next/image"
import Link from "next/link"
import { useSyncExternalStore, type MouseEvent } from "react"

import { browserNavigation, currentPreviousScreen, screenName } from "@/lib/back-navigation"
import { cn } from "@/lib/utils"

// The one back control (Figma G6, revised 2026-10-24): the designers' quiz
// arrow in a 48 box, Indigo-black 70%, flush with the content edge, and no
// destination word on screen. No page title in the header either: every
// screen names itself in its own heading (G2). "I always go to the top left
// to go back" (solution interview, 2026-10-17).
// Where it goes (Global G1, 2026-11-08): the screen the student was on before,
// else `backHref`, the screen's logical parent. See lib/back-navigation.
function AppHeader({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <header className="box-content flex h-14 items-center px-6 pt-8">
      <BackLink href={backHref} label={backLabel} />
    </header>
  )
}

// Shared with the auth screens' Back button, so every back control looks the same.
const BACK_CONTROL =
  "flex size-12 shrink-0 items-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress"

function subscribe(onChange: () => void) {
  const navigation = browserNavigation()
  navigation?.addEventListener("currententrychange", onChange)
  return () => navigation?.removeEventListener("currententrychange", onChange)
}

// The previous Cense screen's address, as a string so React can compare it.
function previousHref(): string | null {
  return currentPreviousScreen()?.href ?? null
}

// `href` and `label` are the logical parent, used when there is no Cense
// screen behind this one. The screen shows only the arrow; screen readers hear
// where it goes ("Back to Home"). The light tone is for navy headers (the
// result screen).
function BackLink({
  href,
  label,
  tone = "dark",
}: {
  href: string
  label: string
  tone?: "dark" | "light"
}) {
  const previous = useSyncExternalStore(subscribe, previousHref, () => null)
  const name = previous ? (screenName(new URL(previous)) ?? "the last screen") : label

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window (modifier keys) opens the parent, as a link should.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    // Read again at the moment of the tap: the history may have changed.
    if (!currentPreviousScreen()) return
    event.preventDefault()
    window.history.back()
  }

  return (
    <Link
      href={href}
      // No Cense screen behind: the parent replaces this entry, so it stands
      // in for the history the student never had, and Back never stacks.
      replace
      onClick={onClick}
      aria-label={`Back to ${name}`}
      className={cn(BACK_CONTROL, tone === "dark" ? "focus-visible:outline-ring" : "focus-visible:outline-off-white")}
    >
      <Image src={tone === "dark" ? "/icons/arrow-left-dark.svg" : "/icons/arrow-left.svg"} alt="" width={48} height={48} />
    </Link>
  )
}

export { AppHeader, BACK_CONTROL, BackLink }
