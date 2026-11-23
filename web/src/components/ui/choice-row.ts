// Created with Claude Code (2026-11-22). The old name for an answer styled as a
// link. Screens still in review import it (first login's "Do you have a credit
// card yet?", #133), so it now gives them the Choice card and they pick up the
// new look whichever merges first. New code uses choiceCardClass().
import { choiceCardClass } from "@/components/ui/choice-card"

export const choiceRowClass = choiceCardClass()
