// Created with Claude Code (2026-11-21). Which version of a shared component
// the app draws. The main version is design's current component; the archived
// one is what the app showed before it, kept in components/legacy/ so a
// rollback is one word here and a deploy, with nothing restored from history
// (Ben, 2026-11-21: "make sure that nothing is fully deleted").
//
// - choiceCard "borderless": the Design System's Choice card · borderless
//   (Figma 765:2498), approved Nov 16. "legacy": the white card with a 1.5px
//   violet outline and the green-circle check (SelectionMark) that was live
//   until then.

export type ChoiceCardLook = "borderless" | "legacy";

export const UI_VERSION: { choiceCard: ChoiceCardLook } = {
  choiceCard: "borderless",
};
