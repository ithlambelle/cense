import { learnTopicPath, ROUTES } from "@/lib/routes";

import { findTopic } from "./answers";

// Ask Penny's back arrow: the topic page it was opened from, else Learn. A
// hand-typed or unknown value falls back to Learn.
export function pennyBackLink(from: string | string[] | undefined): { href: string; label: string } {
  const topic = typeof from === "string" ? findTopic(from) : undefined;
  if (topic) return { href: learnTopicPath(topic.slug), label: topic.label };
  return { href: ROUTES.learn, label: "Learn" };
}
