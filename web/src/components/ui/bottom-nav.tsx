"use client"

import CreditCard from "@gravity-ui/icons/CreditCard"
import House from "@gravity-ui/icons/House"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// MVP1 has two tabs (Ben, 2026-10-16). The frames draw four (Today, Learn,
// Goals, Invest) for a later product; Learn, Goals and Invest have no MVP1 screens.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
] as const

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The navy bar with stars from the frames (395:755): the active tab is light
// blue and semibold, the others off-white.
function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="relative flex justify-center overflow-x-clip bg-navy px-3 pt-3 pb-[max(1.8rem,env(safe-area-inset-bottom))] shadow-[0_-4px_8px_11px_var(--color-navy)]"
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
                  "flex min-h-11 flex-col items-center gap-[7px] rounded-input text-body-s outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-blue",
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
  )
}

export { BottomNav }
