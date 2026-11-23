"use client"

// Created with Claude Code (2026-11-19). The Design System's Accordion section
// (Figma gPofkJWVZ2wUWyF9SfHW6O, 630:151; Ben, Nov 11, from Steven: use an
// accordion), first used by the card page (Flow 2, K1 821:8748 and K2
// 821:8793). Closed: the title (Inter Semi Bold 16, Deep navy) over a one-line
// summary (Inter 13 at 70%), a 20px Amethyst chevron at the right, inside a
// white box with a 1.5px Amethyst 35% border, radius 22, 20/16 padding. Open:
// the chevron turns up, then a 1px Amethyst 15% divider and the body (Inter
// 14/24), 14px apart. One section is open at a time, as the component says.
//
// The WAI-ARIA accordion pattern: each title is a button in a heading, with
// aria-expanded and aria-controls; its panel is a region named by the title.
// Enter and Space open and close (the button's own keys); Up and Down move
// between titles, Home and End go to the first and last. Opening fades the
// body in with CSS (animate-fade-in), and the chevron turns only when the
// student allows motion.

import ChevronDown from "@gravity-ui/icons/ChevronDown"
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type AccordionState = { open: string | null; toggle: (value: string) => void }

const AccordionContext = createContext<AccordionState | null>(null)

// Marks the titles (data-accordion-trigger), so the arrow keys find them and nothing else.
const TRIGGER = "data-accordion-trigger"

// `defaultOpen` is the section open on arrival, by its value; none when left out.
function Accordion({
  defaultOpen = null,
  className,
  children,
}: {
  defaultOpen?: string | null
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const root = useRef<HTMLDivElement>(null)

  // Tapping the open section closes it; tapping another opens it and closes the first.
  const toggle = (value: string) => setOpen((current) => (current === value ? null : value))

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (!target.hasAttribute(TRIGGER)) return
    const triggers = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(`[${TRIGGER}]`) ?? [])
    const index = triggers.indexOf(target as HTMLButtonElement)
    if (index === -1) return
    const last = triggers.length - 1
    const next =
      event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null
    if (next === null) return
    event.preventDefault()
    triggers[next].focus()
  }

  return (
    <AccordionContext value={{ open, toggle }}>
      {/* The keys belong to the titles inside; the box itself takes no focus. */}
      <div ref={root} onKeyDown={onKeyDown} className={cn("flex flex-col gap-3", className)}>
        {children}
      </div>
    </AccordionContext>
  )
}

function AccordionSection({
  value,
  title,
  summary,
  sensitive,
  children,
}: {
  // Names this section to its Accordion (defaultOpen) and in tests.
  value: string
  title: string
  // One line under the title that says what is inside, shown open or closed.
  summary: ReactNode
  // A class added to the whole section, such as SENSITIVE for a summary or
  // body that restates the student's own answers or card.
  sensitive?: string
  children: ReactNode
}) {
  const state = useContext(AccordionContext)
  if (!state) throw new Error("AccordionSection must be inside an Accordion.")
  const id = useId()
  const titleId = `${id}-title`
  const panelId = `${id}-panel`
  const open = state.open === value

  return (
    <section
      data-accordion-section={value}
      className={cn("rounded-card border-[1.5px] border-violet/35 bg-white", sensitive)}
    >
      <h2>
        <button
          type="button"
          data-accordion-trigger=""
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => state.toggle(value)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 px-5 pt-4 text-left hover:bg-off-white/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            open ? "rounded-t-[20.5px] pb-[14px]" : "rounded-[20.5px] pb-4",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
            <span id={titleId} className="text-body-m leading-[normal] font-semibold text-navy">
              {title}
            </span>
            <span className="text-[13px] leading-[normal] text-indigo-black/70">{summary}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            width={20}
            height={20}
            className={cn("shrink-0 text-violet motion-safe:transition-transform motion-safe:duration-200", open && "rotate-180")}
          />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={titleId} hidden={!open} className="px-5 pb-4">
        <div className="h-px bg-violet/15" />
        {/* Shown again each time it opens, so the fade runs on every open. */}
        <div className="animate-fade-in pt-[14px] text-body-s leading-6 text-indigo-black">{children}</div>
      </div>
    </section>
  )
}

export { Accordion, AccordionSection }
