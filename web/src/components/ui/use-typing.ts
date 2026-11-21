"use client"

import { useEffect, useState } from "react"

// Moved from ui/bottom-nav.tsx (Claude Code, 2026-11-21), unchanged, so the
// bottom bar and its archived three-tab version share one rule for hiding
// while the student types.

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
export function useTyping(): boolean {
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
