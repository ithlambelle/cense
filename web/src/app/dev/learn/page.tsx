import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearnView } from "@/components/learn/learn-view";
import { devPagesEnabled } from "@/lib/dev-only";

export const metadata: Metadata = { title: "Learn preview", robots: { index: false } };

// The Learn tab without signing in, for the localhost walkthrough.
export default function LearnPreviewPage() {
  if (!devPagesEnabled()) notFound();
  return <LearnView />;
}
