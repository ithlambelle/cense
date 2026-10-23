import type { Metadata } from "next";

import { CardListView, type YourMatch } from "@/components/cards/card-list-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { listCards } from "@/lib/cards/catalog";
import { cardDisplayName } from "@/lib/copy/results";
import { loadQuizResult } from "@/lib/student-data";

export const metadata: Metadata = { title: "Cards | CENSE" };

// Open to everyone: no account is needed to browse. A signed-in student who
// has finished the quiz sees their match on top.
export default async function CardsPage() {
  const student = await authenticatedStudent();
  let yourMatch: YourMatch | null = null;
  if (student) {
    try {
      const result = await loadQuizResult(student);
      if (result.kind === "match") yourMatch = { name: cardDisplayName(result.card), tier: result.fit.tier };
      if (result.kind === "no_card") yourMatch = { name: null, tier: "not_yet" };
    } catch {
      // The list still works without the match row; the quiz button stays.
      console.warn(JSON.stringify({ event: "cards_match_read_failed" }));
    }
  }
  return <CardListView cards={listCards()} signedIn={student !== null} yourMatch={yourMatch} />;
}
