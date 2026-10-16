import type { ApiData } from "@/lib/api-client/client";
import { annualFeeLine } from "@/lib/copy/results";

type Card = ApiData<"/cards/{id}", "get">;

// The three facts US-01 asks for on every card: brand, name and annual fee.
export function CardSummary({ card, as: Heading = "h2" }: { card: Card; as?: "h1" | "h2" }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-muted-foreground">{card.brand}</p>
      <Heading className="font-heading text-card-name font-semibold">{card.name}</Heading>
      <p className="text-label text-muted-foreground">{annualFeeLine(card.annualFeeCents)}</p>
    </div>
  );
}
