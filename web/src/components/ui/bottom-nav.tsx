"use client"

import CreditCard from "@gravity-ui/icons/CreditCard"
import File from "@gravity-ui/icons/File"
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

// Fields that bring up the on-screen keyboard (or a date or time picker).
const TEXT_INPUT_TYPES = new Set([
  "text", "email", "number", "tel", "search", "password", "url",
  "date", "time", "datetime-local", "month",
])

function isTextField(element: Element | EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement) return !element.readOnly
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type) && !element.readOnly
}

// True while a text field has focus. Focus, not keyboard size: iOS Safari has
// no VirtualKeyboard API or interactive-widget, and its visualViewport resize
// can fire late (MDN, caniuse; WebKit bug 265578).
function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    // Whatever has focus now, in case a field was focused before this mounted.
    const check = () => setTyping(isTextField(document.activeElement))
    check()
    let timer: ReturnType<typeof setTimeout> | undefined
    // True while a finger or mouse button is down. Pressing a button below a
    // field moves focus off the field on press, but the click lands on
    // release: if the bar came back in between, the release fell on the bar
    // and the button never fired (found Oct 24: "Continue" on the denial
    // reason did nothing). So the bar waits for the press to end.
    let pressing = false
    const recheck = () => {
      clearTimeout(timer)
      timer = setTimeout(check, 0)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target)) setTyping(true)
      // Focus moving to a button during a press: wait for the release. With
      // a finger, Chrome sends pointerup before the mousedown that moves
      // focus, so `pressing` is already false here; the click still follows
      // in the same task. Re-reading after this task keeps the bar away until
      // the click has landed.
      else if (!pressing) recheck()
    }
    // Re-read once the move has settled (after the next focusin), so moving
    // from one field to the next never flashes the bar, and focus leaving the
    // window is read from what actually holds focus.
    const onFocusOut = () => {
      if (!pressing) recheck()
    }
    const onPointerDown = () => {
      pressing = true
    }
    const onPointerUp = () => {
      pressing = false
      recheck()
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("pointerup", onPointerUp, true)
    document.addEventListener("pointercancel", onPointerUp, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("pointerup", onPointerUp, true)
      document.removeEventListener("pointercancel", onPointerUp, true)
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
// heavier white label and a pill behind its icon. The stars stay, quieter.
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
                {/* The pill behind the active icon, white at 16% as in the Figma bar
                    component (light blue is not a palette color). It is
                    decoration: the current tab is carried by the white,
                    heavier label and aria-current. */}
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
  )
}

export { BottomNav }
