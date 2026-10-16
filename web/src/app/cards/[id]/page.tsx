import type { Metadata } from "next";

import { CardDetailFlow } from "@/components/cards/card-detail-flow";

export const metadata: Metadata = { title: "Card details | CENSE" };

export default async function CardDetailPage({ params }: PageProps<"/cards/[id]">) {
  const { id } = await params;
  return <CardDetailFlow cardId={id} />;
}
