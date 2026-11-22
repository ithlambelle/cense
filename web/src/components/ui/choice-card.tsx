import Image from "next/image"
import type { ComponentProps, ReactNode } from "react"

import { legacyAnswerCardClass } from "@/components/legacy/answer-card"
import { choiceRowClass } from "@/components/legacy/choice-row"
import { SelectionMark } from "@/components/legacy/selection-mark"
import { type ChoiceCardLook, UI_VERSION } from "@/lib/ui-version"
import { cn } from "@/lib/utils"

// Choice card · borderless, the Design System component (Figma 765:2498,
// values from get_design_context on the set; Niki proposed it and Ben approved
// it on Nov 16). Every answer a student picks in the app is one of these, so
// the look is set here and nowhere else: the quiz, the spending question,
// Learn and Ask Penny's tapped questions, safe to spend's who-covers step, the
// denial flow, card setup and the snooze sheet.
//
// No border in any state. The fill carries the state, and a state that judges
// an answer also says so in words with an icon, so it never rests on color
// alone (the component's own note; WCAG 1.4.1):
// - Default (765:2476): Off-white, label Inter Regular 16 Indigo-black.
// - Selected (765:2478): Violet, label Inter Medium 16 white (5.45:1). No
//   check: on pick-one and multi-select questions alike, the fill is the mark,
//   and screen readers hear aria-pressed or aria-checked from the caller.
// - Correct (765:2480): Green, "Correct" and a navy check.
// - Incorrect (765:2486): Coral, "Not quite" and a navy x.
// - Reveal (765:2492, "Answer reveal"): Off-white, "Right answer" and a green
//   check, for the right answer after a wrong pick.
// 56 tall, 16px corners, the label 18px in and the indicator 16px in. Hover,
// press, focus and disabled are not drawn; they are the app's usual states.
//
// The archived card (components/legacy/) is drawn instead when
// UI_VERSION.choiceCard is "legacy" (lib/ui-version.ts).
export type ChoiceCardState = "default" | "selected" | "correct" | "incorrect" | "reveal"

const STATE_CLASS: Record<ChoiceCardState, string> = {
  default: "bg-off-white font-normal text-indigo-black hover:bg-off-white-hover",
  // Forced colors (Windows High Contrast) replace the fill, so the system's
  // highlight pair carries Selected there.
  selected:
    "bg-violet font-medium text-white hover:bg-violet-hover forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none",
  correct: "bg-green font-medium text-indigo-black",
  incorrect: "bg-coral font-medium text-indigo-black",
  reveal: "bg-off-white font-medium text-indigo-black",
}

// The fill and label color change together, and only fade where motion is
// welcome: with reduced motion the switch is instant, so white text is never
// drawn over a half-faded Off-white (found by the e2e axe check, Nov 21).
// 12px above and below only shows when a long label wraps past the frame's one
// line (Learn's questions, the income answers at 320px); the card then grows
// past 56 instead of cutting the label off.
const BASE_CLASS =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-button py-3 pr-4 pl-[18px] text-left text-body-m leading-[normal] motion-safe:transition-[background-color,color,scale] motion-safe:duration-200 motion-safe:ease-out-soft motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress forced-colors:border forced-colors:border-[ButtonText]"

// The archive drew only chosen and not chosen; it shows any other state as
// chosen or not, since no live screen judges an answer yet.
const LEGACY_SELECTED: ReadonlySet<ChoiceCardState> = new Set(["selected", "correct", "reveal"])

// The card's classes, for a link styled as a card (Learn's questions, "I
// think it was a mistake"). Buttons use <ChoiceCard>, which adds the indicator.
function choiceCardClass(
  state: ChoiceCardState = "default",
  className?: string,
  look: ChoiceCardLook = UI_VERSION.choiceCard
): string {
  if (look === "legacy") return cn(choiceRowClass, className)
  return cn(BASE_CLASS, STATE_CLASS[state], className)
}

// The Indicator (765:2482, 765:2488, 765:2494): words, Inter Medium 13, then
// the frame's own 20px icon, 6px apart. The icon is decoration; the words are
// read as part of the answer ("Yes Correct").
const INDICATOR: Partial<Record<ChoiceCardState, { text: string; icon: string }>> = {
  correct: { text: "Correct", icon: "/icons/choice-correct.svg" },
  incorrect: { text: "Not quite", icon: "/icons/choice-incorrect.svg" },
  reveal: { text: "Right answer", icon: "/icons/choice-reveal.svg" },
}

function ChoiceCardIndicator({ state }: { state: ChoiceCardState }) {
  const indicator = INDICATOR[state]
  if (!indicator) return null
  // The space keeps "Yes Correct" two words for a screen reader; a flex card
  // does not draw a text node that is only a space.
  return (
    <>
      {" "}
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] leading-[normal] font-medium">
        {indicator.text}
        <Image src={indicator.icon} alt="" width={20} height={20} className="shrink-0 animate-pop" />
      </span>
    </>
  )
}

type ChoiceCardProps = ComponentProps<"button"> & {
  state?: ChoiceCardState
  // A question where more than one answer can be picked (the spending
  // question). The borderless card looks the same either way; the archived
  // card drew an empty ring on these.
  multiple?: boolean
  // Shown after the indicator, such as a spinner while the answer saves.
  end?: ReactNode
  // This screen's own archived card (legacy/answer-card.ts), so a rollback
  // redraws what it showed. Only used when the look is "legacy".
  legacyClassName?: string
  // For the component gallery and tests; screens leave it to UI_VERSION.
  look?: ChoiceCardLook
}

// An answer as a button. The caller gives it its semantics (aria-pressed, or
// role="radio" with aria-checked) and what a tap does; this sets the look.
function ChoiceCard({
  state = "default",
  multiple = false,
  end,
  legacyClassName,
  look = UI_VERSION.choiceCard,
  className,
  children,
  type = "button",
  ...props
}: ChoiceCardProps) {
  if (look === "legacy") {
    return (
      <button type={type} className={cn(legacyClassName ?? legacyAnswerCardClass, className)} {...props}>
        <span className="min-w-0 flex-1">{children}</span>
        <SelectionMark selected={LEGACY_SELECTED.has(state)} ring={multiple} />
        {end}
      </button>
    )
  }
  return (
    <button type={type} className={choiceCardClass(state, className, look)} {...props}>
      <span className="min-w-0 flex-1">{children}</span>
      <ChoiceCardIndicator state={state} />
      {end}
    </button>
  )
}

export { ChoiceCard, choiceCardClass }
