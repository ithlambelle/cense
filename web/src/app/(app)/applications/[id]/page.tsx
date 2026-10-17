import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarkResult } from "@/components/applications/mark-result";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationIdSchema } from "@/lib/api/schemas";
import { applicationPath, ROUTES, signInPath } from "@/lib/routes";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Update your card | CENSE" };

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(applicationPath(id)));
  const application = await loadApplication(student, id);
  if (!application) notFound();
  // A rejected card is handled by the rejection guide (it can turn into an
  // approval through a second look), not by marking it again here.
  if (application.status === "rejected") redirect(`${ROUTES.denied}?application=${encodeURIComponent(id)}`);
  return <MarkResult application={application} />;
}
