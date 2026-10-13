import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/lib/dev-only";

import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Components", robots: { index: false } };

export default function ComponentsPage() {
  if (!devPagesEnabled()) notFound();
  return <Gallery />;
}
