import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarkResult } from "@/components/applications/mark-result";
import { applicationIdSchema } from "@/lib/api/schemas";
import { applicationPath, deniedPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Update your card | CENSE" };

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(applicationPath(id));
  const application = await loadApplication(student, id);
  if (!application) notFound();
  // A rejected card is handled by the rejection guide (it can turn into an
  // approval through a second look), not by marking it again here.
  if (application.status === "rejected") redirect(deniedPath("options", id));
  return <MarkResult application={application} />;
}
