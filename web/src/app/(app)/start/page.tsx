import type { Metadata } from "next";

import { StartFlow } from "@/components/home/start-flow";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "CENSE" };

export default async function Page() {
  await requireStudent(ROUTES.home);
  return <StartFlow />;
}
