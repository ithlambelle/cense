import { IdentifyStudent } from "@/components/analytics/identify-student";
import { loadAnalyticsOn } from "@/lib/analytics-choice";
import { isInternalStudent } from "@/lib/internal-students";
import { currentStudent } from "@/lib/session";

// Every signed-in screen. Identifies the student for analytics on each page
// load, in the browser and the Home Screen app alike (D20, S48). Each page
// still calls requireStudent, which sends a signed-out visitor to sign-in.
export default async function SignedInLayout({ children }: LayoutProps<"/">) {
  const student = await currentStudent();
  const analyticsOn = student ? await loadAnalyticsOn(student) : null;
  return (
    <>
      {student ? (
        <IdentifyStudent
          studentId={student.studentId}
          isInternal={isInternalStudent(student.studentId)}
          analyticsOn={analyticsOn}
        />
      ) : null}
      {children}
    </>
  );
}
