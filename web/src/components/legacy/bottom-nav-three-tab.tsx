"use client"

// Archived 2026-11-21 (Claude Code). The three-tab bar (Home, Cards, Learn,
// with labels; Figma 371:2862) that was live until the Design System's
// Bottom nav · 5 tabs (770:1029) replaced it. Drawn only when UI_VERSION.nav
// is "legacy" (lib/ui-version.ts). Unchanged but for the name and the typing
// rule, which now lives in ui/use-typing.ts.

import CreditCard from "@gravity-ui/icons/CreditCard"
import File from "@gravity-ui/icons/File"
import House from "@gravity-ui/icons/House"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useTyping } from "@/components/ui/use-typing"
import { ROUTES } from "@/lib/routes"
import { cn } from "@/lib/utils"

// Shown on the signed-in app screens, including the quiz, results and the
// denial guide (Ben, 2026-10-17), and on the card pages when signed in. The
// sign-in screens, password reset, and the not-found and error pages leave it
// out.
// Home, Cards and Learn (G1, 144:1338). Learn joined with Ask Penny (Ben,
// 2026-10-23: "Learn joins when Ask Penny works"); its icon is the frame's
// (Icon / Learn 277:2241, Gravity's file). The frames draw four (Today, Learn,
// Goals, Invest) for a later product.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
  { href: ROUTES.learn, label: "Learn", Icon: File },
] as const

// In the gaps between and beside the three tabs, never on a label.
const STARS = [
  { size: 9, className: "top-2 left-[7%]" },
  { size: 7, className: "bottom-3 left-[34%]" },
  { size: 8, className: "top-2 left-[66%]" },
  { size: 6, className: "top-3 right-[6%]" },
] as const

// The bar's padding, shared by the bar and the placeholder that holds its
// place: 6px above the tabs, the safe area (at least 8px) below.
const NAV_HEIGHT = "box-content min-h-12 border-t pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The navy bar with stars from the frames (395:755), made compact (Ben,
// 2026-10-21): students did not read the old, tall bar as navigation. It now
// follows Robinhood, Duolingo and Headspace: a slim bar always docked to the
// bottom edge, every tab an icon with a label, and the active tab marked by a
// heavier white label and a pill behind its icon. The stars stay, quieter.
function LegacyBottomNav() {
  // usePathname can return null outside the App Router (Next docs), so no tab is active then.
  const pathname = usePathname() ?? ""
  const typing = useTyping()

  // Always on screen (Apple's tab bar guidance: hiding it makes people lose
  // their place), except while the student is typing, when the keyboard needs
  // the room and a bar pinned above it only covers the field.
  // Fixed to the bottom of the viewport (Global G2, Figma 477:983): sticky let
  // it float up into the content on short screens. The placeholder keeps the
  // bar's height in the page, so the last of the content can scroll clear of it.
  // No z-index: it follows the content in the page, so it paints over it, and
  // a sheet (portaled after it) still covers it.
  return (
    <>
      <div aria-hidden="true" hidden={typing} data-slot="bottom-nav-space" className={cn(NAV_HEIGHT, "border-transparent")} />
      <nav
        aria-label="Main"
        hidden={typing}
        className={cn(
          NAV_HEIGHT,
          "fixed inset-x-0 bottom-0 flex justify-center overflow-hidden border-white/10 bg-navy"
        )}
      >
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
      {/* The same 24px side margins as the content (G2). */}
      <ul className="relative flex w-full max-w-phone px-6">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-12 flex-col items-center gap-0.5 rounded-input text-body-s transition-[color,scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  active ? "font-semibold text-light-blue" : "text-white/70 hover:text-white"
                )}
              >
                {/* The active tab is Light Blue (#BAE4FF, light-blue/100) and the
                    others white at 70%, as in the Figma bar component (371:2862);
                    Light Blue is the design system's accent on dark navy. The
                    pill behind the active icon, white at 16%, is decoration:
                    the current tab is carried by the color, the heavier label
                    and aria-current. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-14 items-center justify-center rounded-pill transition-colors duration-200",
                    active ? "bg-white/16" : "group-hover:bg-white/5"
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
    </>
  )
}

export { LegacyBottomNav }
