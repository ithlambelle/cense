"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { LegacyBottomNav } from "@/components/legacy/bottom-nav-three-tab"
import { useTyping } from "@/components/ui/use-typing"
import { ROUTES } from "@/lib/routes"
import { type NavLook, UI_VERSION } from "@/lib/ui-version"
import { cn } from "@/lib/utils"

// Bottom nav · 5 tabs, the Design System component (Figma 770:1029, values from
// get_design_context on each Active variant; Niki proposed it and Ben approved
// it on Nov 16): Home, Cards, Penny, Calendar, Profile.
//
// Shown on the signed-in app screens, including the quiz, results and the
// denial guide (Ben, 2026-10-17), and on the card pages when signed in. The
// sign-in screens, password reset, and the not-found and error pages leave it
// out.
//
// Icons only, as drawn (Ben, Nov 21: "I like the current design"): every tab
// still has a name a screen reader says, and the current one is marked with
// aria-current. Active icons are Light Blue, the others white at 70%, the
// frames' own 32px glyphs (Nav tab, icon only, 687:161). Penny sits in the
// center: the star Penny on her backdrop, or, on the Penny tab, the winking
// Penny in a Light Blue ring. The Penny tab opens Learn and Ask Penny (Ben,
// Nov 21; he noted it may read as education being the center of the app, to
// revisit). Profile opens Your account, as the avatar on Home does.
//
// The archived three-tab bar (components/legacy/) is drawn instead when
// UI_VERSION.nav is "legacy" (lib/ui-version.ts).

type Tab = { href: string; label: string; icon: "home" | "cards" | "penny" | "calendar" | "profile" }

const TABS: readonly Tab[] = [
  { href: ROUTES.home, label: "Home", icon: "home" },
  { href: ROUTES.cards, label: "Cards", icon: "cards" },
  { href: ROUTES.learn, label: "Penny", icon: "penny" },
  { href: ROUTES.calendar, label: "Calendar", icon: "calendar" },
  { href: ROUTES.settings, label: "Profile", icon: "profile" },
]

// The frame's 90: 12 above the tabs, the 53px tabs, 25 below, or the safe area
// when a phone's home indicator needs more.
const NAV_HEIGHT = "box-content h-[53px] pt-3 pb-[max(1.5625rem,env(safe-area-inset-bottom))]"

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The Penny tab's art (Tab / Penny, 770:907 and 770:963). Inactive: the star
// Penny (52 by 62, 8px above the circle) over her 47px Off-white backdrop.
// Active: the winking Penny in a 52px Off-white circle with a 3px Light Blue
// ring, cropped as the frame crops her.
function PennyArt({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="relative size-[52px] overflow-hidden rounded-pill border-3 border-light-blue bg-off-white">
        <Image
          src="/nav/penny-wink.png"
          alt=""
          width={722}
          height={616}
          sizes="79px"
          className="absolute top-[-12.94%] left-[-3.03%] h-[129.36%] w-[151.52%] max-w-none"
        />
      </span>
    )
  }
  return (
    <span className="relative size-[52px]">
      <Image src="/nav/penny-backdrop.svg" alt="" width={47} height={47} className="absolute top-[5.7px] left-[2.5px]" />
      <Image
        src="/nav/penny-star.png"
        alt=""
        width={747}
        height={896}
        sizes="52px"
        className="pointer-events-none absolute top-[-8px] left-0 h-[62px] w-[52px] max-w-none object-contain"
      />
    </span>
  )
}

function FiveTabNav() {
  // usePathname can return null outside the App Router (Next docs), so no tab is active then.
  const pathname = usePathname() ?? ""
  const typing = useTyping()

  // Always on screen (Apple's tab bar guidance: hiding it makes people lose
  // their place), except while the student is typing, when the keyboard needs
  // the room. Fixed to the bottom of the viewport (G2); the placeholder keeps
  // the bar's height in the page, so the last of the content scrolls clear of
  // it. No z-index: it follows the content, so it paints over it, and a sheet
  // (portaled after it) still covers it.
  return (
    <>
      <div aria-hidden="true" hidden={typing} data-slot="bottom-nav-space" className={NAV_HEIGHT} />
      <nav
        aria-label="Main"
        hidden={typing}
        className={cn(NAV_HEIGHT, "fixed inset-x-0 bottom-0 flex justify-center overflow-hidden bg-navy")}
      >
        <div className="relative flex w-full max-w-phone">
          {/* The frame's star layer (770:890), stretched across the bar as drawn. */}
          <Image
            src="/nav/stars.svg"
            alt=""
            aria-hidden="true"
            width={353}
            height={90}
            className="pointer-events-none absolute -top-3 left-[4.62%] h-[90px] w-[90.51%] max-w-none"
          />
          <ul className="relative flex w-full items-center px-[13px]">
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href)
              return (
                <li key={tab.href} className="flex flex-1 justify-center">
                  <Link
                    href={tab.href}
                    aria-label={tab.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center justify-center rounded-input transition-[scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
                      // The Penny tab is 67 tall in the frame (59 when active)
                      // and clips the star at its top, as drawn.
                      tab.icon === "penny" ? cn("overflow-hidden", active ? "h-[59px]" : "h-[67px]") : "h-[53px]"
                    )}
                  >
                    {tab.icon === "penny" ? (
                      <PennyArt active={active} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-12 items-center justify-center rounded-pill transition-colors duration-200",
                          !active && "group-hover:bg-white/5"
                        )}
                      >
                        <Image src={`/nav/${tab.icon}-${active ? "active" : "inactive"}.svg`} alt="" width={32} height={32} />
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
    </>
  )
}

function BottomNav({ look = UI_VERSION.nav }: { look?: NavLook }) {
  return look === "legacy" ? <LegacyBottomNav /> : <FiveTabNav />
}

export { BottomNav }
