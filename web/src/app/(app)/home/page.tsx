import type { Metadata } from "next";

import { HomeFlow } from "@/components/home/home-flow";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Home | CENSE" };

export default async function Page() {
  await requireStudent(ROUTES.home);
  return <HomeFlow />;
}
