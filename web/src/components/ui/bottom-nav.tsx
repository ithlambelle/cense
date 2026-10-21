"use client"

import CreditCard from "@gravity-ui/icons/CreditCard"
import House from "@gravity-ui/icons/House"
import SealCheck from "@gravity-ui/icons/SealCheck"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// Shown on the signed-in app screens, including the quiz, results and the
// denial guide (Ben, 2026-10-17), and on the card pages when signed in. The
// sign-in screens, password reset, and the not-found and error pages leave it
// out. A future search view may hide it.
// Three tabs (Ben, 2026-10-21): solution interviews showed students could not
// get back to their match once they left it, so it gets its own tab. The
// frames draw four (Today, Learn, Goals, Invest) for a later product; Learn
// joins when its screens exist.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.results, label: "My match", Icon: SealCheck },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
] as const

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Scroll distance, in px, that counts as a change of direction, so a jittery
// thumb or iOS rubber-banding does not flicker the bar.
const SCROLL_SLACK = 6

// True while the student is scrolling down through a page, so the bar gets out
// of the way of the content under it (answers in the quiz, the last card in a
// list). It comes back on any scroll up, near the top, and at the end of the
// page, where the content above it is already fully in view.
function useHiddenOnScrollDown(): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0

    function update() {
      frame = 0
      const y = window.scrollY
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - SCROLL_SLACK
      if (y < 24 || atEnd) {
        setHidden(false)
        lastY = y
      } else if (y > lastY + SCROLL_SLACK) {
        setHidden(true)
        lastY = y
      } else if (y < lastY - SCROLL_SLACK) {
        setHidden(false)
        lastY = y
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return hidden
}

// The navy bar from the frames (395:755), without the stars: in interviews
// students did not read the starry bar as navigation (2026-10-21). It follows
// the pattern of Robinhood, Duolingo and the platform guidelines instead: a
// plain bar on the bottom edge, every tab an icon with a visible label, and the
// active tab marked by a filled indicator behind its icon as well as color.
function BottomNav() {
  // usePathname can return null outside the App Router (Next docs), so no tab is active then.
  const pathname = usePathname() ?? ""
  const hidden = useHiddenOnScrollDown()

  // The clip box keeps the bar, when slid away, from adding to the page's
  // scroll height. Its top 24px is the bar's soft edge over the content, and
  // lets taps through to whatever is under it.
  return (
    <div className="pointer-events-none -mt-6 overflow-hidden pt-6">
      <div
        className={cn(
          "transition-transform duration-300 ease-out-soft focus-within:translate-y-0 motion-reduce:transition-none",
          hidden && "translate-y-full"
        )}
      >
        <div aria-hidden="true" className="h-6 bg-linear-to-t from-navy/35 to-transparent" />
        <nav
          aria-label="Main"
          className="pointer-events-auto relative flex justify-center border-t border-white/10 bg-navy px-3 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <ul className="relative flex w-full max-w-phone">
            {TABS.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href)
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-12 flex-col items-center gap-1 rounded-input text-body-s outline-none transition-[color,scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-blue",
                      active ? "font-semibold text-light-blue" : "text-off-white/80 hover:text-off-white"
                    )}
                  >
                    {/* The indicator: a pill behind the active icon, so the current tab
                        does not rely on color alone. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-8 w-16 items-center justify-center rounded-pill transition-colors duration-200",
                        active ? "bg-light-blue/20" : "group-hover:bg-white/5"
                      )}
                    >
                      <Icon width={22} height={22} />
                    </span>
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}

export { BottomNav }
