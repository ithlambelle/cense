"use client"

import { CreditCard, House } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// MVP1 has two tabs (US-02). The hi-fi draws four for a later product.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.cards) return pathname.startsWith(ROUTES.cards)
  return pathname.startsWith(href)
}

function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="flex justify-center border-t border-track bg-indigo-black px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <ul className="flex w-full max-w-phone">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center gap-1.5 rounded-input text-xs outline-none focus-visible:outline-2 focus-visible:outline-ring",
                  // Violet 12px text on this bar is 3.48 to 1, so the active
                  // label is white and bold and the icon carries the violet.
                  // Palette colours, not theme tokens: the bar stays dark in the
                  // light theme, where foreground is indigo-black like the bar.
                  active ? "font-bold text-white" : "text-off-white/75"
                )}
              >
                <Icon aria-hidden="true" className={cn("size-[22px]", active && "text-primary")} />
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
