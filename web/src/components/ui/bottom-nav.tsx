"use client"

import CreditCard from "@gravity-ui/icons/CreditCard"
import House from "@gravity-ui/icons/House"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// Shown on the signed-in app screens, including the quiz, results and the
// denial guide (Ben, 2026-10-17), and on the card pages when signed in. The
// sign-in screens, password reset, and the not-found and error pages leave it
// out. A future search view may hide it.
// MVP1 has two tabs (Ben, 2026-10-16). The frames draw four (Today, Learn,
// Goals, Invest) for a later product; Learn, Goals and Invest have no MVP1 screens.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
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

// The navy bar with stars from the frames (395:755): the active tab is light
// blue and semibold, the others off-white.
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
          className="pointer-events-auto relative flex justify-center overflow-x-clip bg-navy px-3 pt-3 pb-[max(1.8rem,env(safe-area-inset-bottom))]"
        >
          {/* Drawn for the four-tab bar; shifted so no star sits on the two MVP1 tabs. */}
          <Image
            src="/decor/nav-stars.svg"
            alt=""
            aria-hidden="true"
            width={353}
            height={90}
            className="pointer-events-none absolute top-0 left-[calc(50%+40px)] -translate-x-1/2"
          />
          <ul className="relative flex w-full max-w-phone">
            {TABS.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href)
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col items-center gap-[7px] rounded-input text-body-s outline-none transition-[color,scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-blue",
                      active ? "font-semibold text-light-blue" : "text-off-white"
                    )}
                  >
                    <Icon aria-hidden="true" width={22} height={22} />
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
