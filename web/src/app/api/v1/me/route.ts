import { authenticatedStudent } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  return Response.json(
    { id: student.studentId, email: student.email },
    { headers: { "Cache-Control": "no-store" } },
  );
}
