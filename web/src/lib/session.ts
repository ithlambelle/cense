import { redirect } from "next/navigation";

import { authenticatedStudent } from "@/lib/api/auth";
import { signInPath } from "@/lib/routes";

// Call at the top of every signed-in page. It runs on the server, so a
// signed-out visitor is sent to sign-in and never receives the screen.
// `next` is where they return afterwards and must be on the allow-list.
export async function requireStudent(next: string): Promise<void> {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(next));
}
