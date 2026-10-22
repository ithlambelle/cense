import type { Metadata } from "next";

import { LearnView } from "@/components/learn/learn-view";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Learn | CENSE" };

export default async function LearnPage() {
  await requireStudent(ROUTES.learn);
  return <LearnView />;
}
