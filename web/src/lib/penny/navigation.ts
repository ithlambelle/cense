import { findCard } from "@/lib/cards/catalog";
import { cardPath, learnTopicPath, ROUTES } from "@/lib/routes";

import { findTopic } from "./answers";

// Where Ask Penny was opened from Your match ("What is a secured card?").
export const PENNY_FROM_RESULTS = "results";

// Ask Penny's back arrow: the topic page it was opened from, Your match, or a
// catalog card's page (its ID), else Learn. A hand-typed or unknown value
// falls back to Learn.
export function pennyBackLink(from: string | string[] | undefined): { href: string; label: string } {
  if (typeof from !== "string") return { href: ROUTES.learn, label: "Learn" };
  const topic = findTopic(from);
  if (topic) return { href: learnTopicPath(topic.slug), label: topic.label };
  if (from === PENNY_FROM_RESULTS) return { href: ROUTES.results, label: "Your match" };
  if (findCard(from)) return { href: cardPath(from), label: "Card details" };
  return { href: ROUTES.learn, label: "Learn" };
}
