import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarkResult } from "@/components/applications/mark-result";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationIdSchema } from "@/lib/api/schemas";
import { applicationPath, signInPath } from "@/lib/routes";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Update your card | CENSE" };

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(applicationPath(id)));
  const application = await loadApplication(student, id);
  if (!application) notFound();
  return <MarkResult application={application} />;
}
