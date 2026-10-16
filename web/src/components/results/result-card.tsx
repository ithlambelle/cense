import { CardSummary } from "@/components/cards/card-summary";
import { IssuerButtons } from "@/components/cards/issuer-buttons";
import { GlowCard } from "@/components/ui/glow-card";
import { NoteLine } from "@/components/ui/note";
import { TierBadge } from "@/components/ui/tier-badge";
import type { ApiData } from "@/lib/api-client/client";

type Recommendation = ApiData<"/recommendations/latest", "get">;
type Card = ApiData<"/cards/{id}", "get">;

type ResultCardProps = {
  recommendation: Recommendation;
  // Null while the card catalog is not available.
  card: Card | null;
};

// Shows what the server decided. The tier and the reason come from the API
// and are rendered as plain text; nothing here works out a tier.
export function ResultCard({ recommendation, card }: ResultCardProps) {
  return (
    <GlowCard purpose="result">
      <TierBadge tier={recommendation.fitTier} />
      {card ? (
        <CardSummary card={card} />
      ) : (
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-card-name font-semibold">Your card match is saved</h2>
          <NoteLine>We can’t show this card’s details right now. Check back soon.</NoteLine>
        </div>
      )}
      {/* The API allows a result with no reason. Then the heading is left out too. */}
      {recommendation.reason !== null ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-section font-semibold">
            {recommendation.fitTier === "likely_fit" ? "Why it fits you" : "What to know"}
          </h3>
          <p className="text-body">{recommendation.reason}</p>
        </div>
      ) : null}
      {card ? <IssuerButtons card={card} /> : null}
    </GlowCard>
  );
}
