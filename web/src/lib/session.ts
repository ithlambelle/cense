import { redirect } from "next/navigation";
import { cache } from "react";

import { authenticatedStudent, type Student } from "@/lib/api/auth";
import { signInPath } from "@/lib/routes";

// The signed-in student, or null, looked up once per request: the (app)
// layout and the page both ask, and React's cache makes that one call to
// Supabase instead of two.
export const currentStudent = cache(authenticatedStudent);

// Call at the top of every signed-in page. It runs on the server, so a
// signed-out visitor is sent to sign-in and never receives the screen.
// `returnPath` is where they come back to after signing in; a path that is not
// on the allow-list in routes.ts is dropped, and they land on /start instead.
export async function requireStudent(returnPath: string): Promise<Student> {
  const student = await currentStudent();
  if (!student) redirect(signInPath(returnPath));
  return student;
}
