import { redirect } from "next/navigation";

import { authenticatedStudent, type Student } from "@/lib/api/auth";
import { signInPath } from "@/lib/routes";

// Call at the top of every signed-in page. It runs on the server, so a
// signed-out visitor is sent to sign-in and never receives the screen.
// `returnPath` is where they come back to after signing in; a path that is not
// on the allow-list in routes.ts is dropped, and they land on /start instead.
export async function requireStudent(returnPath: string): Promise<Student> {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(returnPath));
  return student;
}
