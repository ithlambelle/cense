import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WaitingView } from "@/components/applications/waiting-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationIdSchema } from "@/lib/api/schemas";
import { ROUTES, signInPath } from "@/lib/routes";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Still waiting | CENSE" };

export default async function WaitingPage({ params }: PageProps<"/applications/[id]/waiting">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  const application = await loadApplication(student, id);
  if (!application) notFound();
  return <WaitingView application={application} />;
}
