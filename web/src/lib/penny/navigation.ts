import { findCard } from "@/lib/cards/catalog";
import { cardOrigin, cardPath, learnTopicPath, ROUTES } from "@/lib/routes";

import { findTopic } from "./answers";

// The ?from= value a card page puts on its lesson link: "card:<id>", plus
// ":<origin>" when the card page was opened from the result or Home, so Back
// from Penny returns to the card page and that page's own Back still works.
export function pennyFromCard(cardId: string, origin?: string): string {
  return origin ? `card:${cardId}:${origin}` : `card:${cardId}`;
}

// Ask Penny's back arrow: the topic page or card page it was opened from, else
// Learn. A hand-typed or unknown value falls back to Learn.
export function pennyBackLink(from: string | string[] | undefined): { href: string; label: string } {
  if (typeof from !== "string") return { href: ROUTES.learn, label: "Learn" };
  const topic = findTopic(from);
  if (topic) return { href: learnTopicPath(topic.slug), label: topic.label };
  const [kind, cardId, origin] = from.split(":");
  if (kind === "card" && cardId) {
    const card = findCard(cardId);
    if (card) return { href: cardPath(card.id, cardOrigin(origin)), label: card.name };
  }
  return { href: ROUTES.learn, label: "Learn" };
}
