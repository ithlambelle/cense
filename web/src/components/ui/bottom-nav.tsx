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
// out.
// Home and Cards. Learn joins when Ask Penny works (Ben, 2026-10-23): a tab
// with nothing to do yet looks tappable and is not. The frames draw four
// (Today, Learn, Goals, Invest) for a later product.
const TABS = [
  { href: ROUTES.home, label: "Home", Icon: House },
  { href: ROUTES.cards, label: "Cards", Icon: CreditCard },
] as const

// In the gaps between and beside the two tabs, never on a label.
const STARS = [
  { size: 9, className: "top-2 left-[7%]" },
  { size: 7, className: "bottom-3 left-1/2" },
  { size: 6, className: "top-3 right-[6%]" },
] as const

// Fields that bring up the on-screen keyboard (or the date picker).
const TEXT_INPUT_TYPES = new Set(["text", "email", "number", "tel", "search", "password", "url", "date"])

function isTextField(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type)
}

// True while a text field has focus. Focus, not keyboard size: iOS Safari has
// no VirtualKeyboard API or interactive-widget, and its visualViewport resize
// can fire late (MDN, caniuse; WebKit bug 265578).
function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(isTextField(event.target))
    // relatedTarget is where focus is going; null when it leaves the page.
    const onFocusOut = (event: FocusEvent) => setTyping(isTextField(event.relatedTarget))
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
    }
  }, [])
  return typing
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// The navy bar with stars from the frames (395:755), made compact (Ben,
// 2026-10-21): students did not read the old, tall bar as navigation. It now
// follows Robinhood, Duolingo and Headspace: a slim bar always docked to the
// bottom edge, every tab an icon with a label, and the active tab marked by a
// filled indicator behind its icon as well as weight. The stars stay, quieter.
function BottomNav() {
  // usePathname can return null outside the App Router (Next docs), so no tab is active then.
  const pathname = usePathname() ?? ""
  const typing = useTyping()

  // Always on screen (Apple's tab bar guidance: hiding it makes people lose
  // their place), except while the student is typing, when the keyboard needs
  // the room and a bar pinned above it only covers the field.
  return (
    <nav
      aria-label="Main"
      hidden={typing}
      className="relative flex justify-center overflow-hidden border-t border-white/10 bg-navy px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
      <ul className="relative flex w-full max-w-phone">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-12 flex-col items-center gap-0.5 rounded-input text-body-s outline-none transition-[color,scale] duration-200 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  active ? "font-semibold text-white" : "text-off-white/80 hover:text-off-white"
                )}
              >
                {/* The indicator: a pill behind the active icon, so the current tab
                    does not rely on color alone. White, as in the Figma bar
                    component; light blue is not a palette color. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-14 items-center justify-center rounded-pill transition-colors duration-200",
                    active ? "bg-white/15" : "group-hover:bg-white/5"
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
  )
}

export { BottomNav }
