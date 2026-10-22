"use client"

import CreditCard from "@gravity-ui/icons/CreditCard"
import House from "@gravity-ui/icons/House"
import BookOpen from "@gravity-ui/icons/BookOpen"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// Shown on the signed-in app screens, including the quiz, results and the
// denial guide (Ben, 2026-10-17), and on the card pages when signed in. The
// sign-in screens, password reset, and the not-found and error pages leave it
// out. A future search view may hide it.
// Home, Cards and Learn (Ben, 2026-10-21). The frames draw four (Today,
// Learn, Goals, Invest) for a later product; Goals and Invest have no screens
// yet, and an empty tab is worse than none.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
  { href: ROUTES.learn, label: "Learn", Icon: BookOpen },
] as const

const STARS = [
  { size: 9, className: "top-2 left-[33%]" },
  { size: 7, className: "bottom-3 left-[67%]" },
  { size: 6, className: "top-3 right-[6%]" },
] as const

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The navy bar with stars from the frames (395:755), made compact (Ben,
// 2026-10-21): students did not read the old, tall bar as navigation. It now
// follows Robinhood, Duolingo and Headspace: a slim bar always docked to the
// bottom edge, every tab an icon with a label, and the active tab marked by a
// filled indicator behind its icon as well as color. The stars stay, quieter.
function BottomNav() {
  // usePathname can return null outside the App Router (Next docs), so no tab is active then.
  const pathname = usePathname() ?? ""

  // Always on screen, like Robinhood and Fidelity: the only screen that may
  // hide it is a future search view.
  return (
    <div>
        <nav
          aria-label="Main"
          className="relative flex justify-center overflow-hidden border-t border-white/10 bg-navy px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {/* A few small stars in the gaps between tabs, never on a label. */}
          {STARS.map((star) => (
            <Image
              key={star.className}
              src="/decor/star-small.svg"
              alt=""
              aria-hidden="true"
              width={star.size}
              height={star.size}
              className={cn("pointer-events-none absolute opacity-70", star.className)}
            />
          ))}
          <ul className="relative flex w-full max-w-phone">
            {TABS.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href)
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-12 flex-col items-center gap-0.5 rounded-input text-body-s outline-none transition-[color,scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-blue",
                      active ? "font-semibold text-light-blue" : "text-off-white/80 hover:text-off-white"
                    )}
                  >
                    {/* The indicator: a pill behind the active icon, so the current tab
                        does not rely on color alone. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-7 w-14 items-center justify-center rounded-pill transition-colors duration-200",
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
  )
}

export { BottomNav }
