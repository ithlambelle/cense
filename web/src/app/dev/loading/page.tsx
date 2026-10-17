import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FindingCards } from "@/components/results/finding-cards";
import { devPagesEnabled } from "@/lib/dev-only";

export const metadata: Metadata = { title: "Loading preview", robots: { index: false } };

// The real result page usually renders too fast for its loading screen to show.
export default function LoadingPreviewPage() {
  if (!devPagesEnabled()) notFound();
  return <FindingCards />;
}
