import Image from "next/image"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

// Choice card, the Design System component (Figma 371:3428, values from
// get_design_context on the set and each variant; change G1, 821:8361). Every
// answer a student picks in the app is one of these, so the look is set here
// and nowhere else: the quiz, the spending question, Learn and Ask Penny's
// tapped questions, safe to spend's who-covers step, the denial flow, card
// setup and the snooze sheet.
//
// Default: white, 1px Amethyst outline, nothing else. The component draws no
// mark for an unchosen card, on pick-one and multi-select questions alike.
// Selected: 2px Amethyst outline and the plain Light Green check, no circle.
// Correct: the check with a 2px green outline. Incorrect: a 2px Coral
// outline and "Not quite". 56 tall, 16px corners, label Inter Medium 16
// Indigo-black (text/primary). Hover, press, focus and disabled are not drawn
// in Figma; they are the app's usual states.
export type ChoiceCardState = "default" | "selected" | "correct" | "incorrect"

// Figma lays the label 18px from the left edge and the mark 16px from the
// right whatever the stroke, because its strokes sit inside the card and take
// no layout space. A CSS border does, so each state's padding is 18 and 16
// less its border width: the label never moves when a card is picked. The
// 12px above and below (also less the border) only shows when a long label
// wraps past the frame's one line; the card is then taller than 56.
const STATE_CLASS: Record<ChoiceCardState, string> = {
  default: "border border-violet py-[11px] pr-[15px] pl-[17px]",
  selected: "border-2 border-violet py-2.5 pr-3.5 pl-4",
  correct: "border-2 border-green py-2.5 pr-3.5 pl-4",
  incorrect: "border-2 border-coral py-2.5 pr-3.5 pl-4",
}

const BASE_CLASS =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-button bg-white text-left text-body-m leading-[normal] font-medium text-indigo-black transition-[background-color,scale] duration-200 ease-out-soft hover:bg-off-white motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"

// The card's classes, for a link styled as a card (Learn's questions, "I
// think it was a mistake"). Buttons use <ChoiceCard>, which adds the mark.
function choiceCardClass(state: ChoiceCardState = "default", className?: string): string {
  return cn(BASE_CLASS, STATE_CLASS[state], className)
}

// The end of the card: the check (Indicator, 371:3433, the frame's own 20px
// asset with its 17.5 by 13.75 check), "Not quite" (371:3441), or nothing.
function ChoiceCardMark({ state }: { state: ChoiceCardState }) {
  if (state === "selected" || state === "correct") {
    return <Image src="/icons/choice-check.svg" alt="" width={20} height={20} className="shrink-0 animate-pop" />
  }
  if (state === "incorrect") {
    // The space keeps "False Not quite" two words for a screen reader; a flex
    // card does not draw a text node that is only a space.
    return (
      <>
        {" "}
        <span className="shrink-0 text-caption leading-[normal] font-normal text-indigo-black/70">Not quite</span>
      </>
    )
  }
  return null
}

type ChoiceCardProps = ComponentProps<"button"> & {
  state?: ChoiceCardState
  // Shown after the mark, such as a spinner while the answer saves.
  end?: ReactNode
}

// An answer as a button. The caller gives it its semantics (aria-pressed, or
// role="radio" with aria-checked) and what a tap does; this sets the look.
function ChoiceCard({ state = "default", end, className, children, type = "button", ...props }: ChoiceCardProps) {
  return (
    <button type={type} className={choiceCardClass(state, className)} {...props}>
      <span className="min-w-0 flex-1">{children}</span>
      <ChoiceCardMark state={state} />
      {end}
    </button>
  )
}

export { ChoiceCard, choiceCardClass }
