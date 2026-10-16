import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/lib/dev-only";

import { QuizPreview } from "./quiz-preview";

export const metadata: Metadata = { title: "Quiz preview", robots: { index: false } };

export default function QuizPreviewPage() {
  if (!devPagesEnabled()) notFound();
  return <QuizPreview />;
}
