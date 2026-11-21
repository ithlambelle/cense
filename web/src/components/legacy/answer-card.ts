// Archived 2026-11-21 (Claude Code). The answer card that was live before the
// Design System's Choice card · borderless (Figma 765:2498) replaced it: white,
// a 1.5px violet outline, navy text, with SelectionMark at the end. Drawn only
// when UI_VERSION.choiceCard is "legacy" (lib/ui-version.ts). Until then each
// screen set its own corners (18px on most, 22px and 80 tall on the quiz's
// two-answer questions); the archive uses the 18px, 56 tall card everywhere.
//
// The buttons' class was answerCardClass in quiz/quiz-screen.tsx; the links'
// was choiceRowClass (archived beside this file, unchanged).

export const legacyAnswerCardClass =
  "flex min-h-14 w-full items-center gap-4 rounded-[18px] border-[1.5px] border-violet bg-white px-[18px] py-3 text-left text-body-m text-navy transition-[background-color,scale] duration-200 ease-out-soft hover:bg-off-white motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress";
