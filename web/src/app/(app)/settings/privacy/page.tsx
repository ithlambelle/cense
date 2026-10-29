import type { Metadata } from "next";

import { PrivacyView } from "@/components/account/privacy-view";
import { loadAnalyticsOn } from "@/lib/analytics-choice";
import { isInternalStudent } from "@/lib/internal-students";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Security and privacy | CENSE" };

// Read on the server, so the switch never shows a default first.
export default async function PrivacyPage() {
  const student = await requireStudent(ROUTES.home);
  return (
    <PrivacyView
      analyticsOn={await loadAnalyticsOn(student)}
      studentId={student.studentId}
      isInternal={isInternalStudent(student.studentId)}
    />
  );
}
