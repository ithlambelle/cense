import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WaitingView } from "@/components/applications/waiting-view";
import { applicationIdSchema } from "@/lib/api/schemas";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Still waiting | CENSE" };

export default async function WaitingPage({ params }: PageProps<"/applications/[id]/waiting">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(ROUTES.home);
  const application = await loadApplication(student, id);
  if (!application) notFound();
  return <WaitingView application={application} />;
}
