// Archived 2026-11-21 (Claude Code). The answer cards that were live before the
// Design System's Choice card · borderless (Figma 765:2498) replaced them:
// white, a violet outline, with SelectionMark at the end. Drawn only when
// UI_VERSION.choiceCard is "legacy" (lib/ui-version.ts).
//
// Screens did not share one card before: each set its own height, corners,
// outline and weight. So each keeps its exact classes from main here, and a
// rollback redraws what that screen showed rather than an average of them.

import { choiceRowClass } from "@/components/legacy/choice-row"
import { cn } from "@/lib/utils"

// Was answerCardClass in quiz/quiz-screen.tsx. Callers added height and corners.
const answerCardClass =
  "flex w-full items-center gap-4 border-[1.5px] border-violet bg-white px-[18px] py-3 text-left text-body-m text-navy transition-[background-color,scale] duration-200 ease-out-soft hover:bg-off-white motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"

const setupCardClass =
  "flex h-14 w-full items-center justify-between rounded-button bg-white pr-4 pl-[18px] text-left text-body-m leading-[normal] font-medium text-indigo-black hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"

export const legacyAnswerCardClass = cn(answerCardClass, "min-h-14 rounded-[18px]")

export const legacyCard = {
  // Two-answer questions were 80 tall with 22px corners; longer lists 56 and 18.
  quiz: (compact: boolean) => cn(answerCardClass, compact ? "min-h-14 rounded-[18px]" : "min-h-20 rounded-card"),
  quizListGap: (choices: number) => (choices >= 6 ? "gap-5" : "gap-6"),
  spending: cn(answerCardClass, "min-h-14 rounded-[18px] px-5"),
  whoCovers: legacyAnswerCardClass,
  markResult: cn(choiceRowClass, "gap-4 text-left disabled:cursor-progress"),
  denial: cn(choiceRowClass, "justify-between gap-4 text-left"),
  denialSaving: cn(choiceRowClass, "justify-between gap-4 text-left disabled:cursor-progress disabled:opacity-60"),
  secondLook: cn(choiceRowClass, "text-left disabled:cursor-not-allowed disabled:opacity-50"),
  penny: cn(choiceRowClass, "text-left"),
  snooze: (selected: boolean) =>
    cn(choiceRowClass, "justify-between text-left font-medium text-indigo-black", selected && "border-2"),
  autopay: cn(setupCardClass, "border border-violet"),
  spendLimit: (selected: boolean) => cn(setupCardClass, "border-violet", selected ? "border-2" : "border"),
  planAction:
    "flex w-full items-start gap-3 rounded-input border-[1.5px] border-violet bg-white p-4 text-left hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  reminder:
    "flex min-h-20 w-full items-center gap-4 rounded-card border-[1.5px] border-violet bg-white px-5 py-3 text-left hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
}
