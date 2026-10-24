import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Celebration } from "@/components/applications/celebration";
import { applicationIdSchema } from "@/lib/api/schemas";
import { applicationPath, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "You’re approved | CENSE" };

export default async function ApprovedPage({ params, searchParams }: PageProps<"/applications/[id]/approved">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(ROUTES.home);
  const application = await loadApplication(student, id);
  if (!application) notFound();
  // Only an approved card has anything to celebrate.
  if (application.status !== "approved") redirect(applicationPath(id));
  const { celebrate } = await searchParams;
  return <Celebration application={application} celebrate={celebrate === "1"} />;
}
