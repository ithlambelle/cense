import "server-only";

// Team accounts, so their events carry is_internal: true and can be filtered
// out of every number (S47, S48). A comma-separated list of Supabase user ids
// in INTERNAL_STUDENT_IDS, a server-only variable: the list never reaches the
// browser, only the yes or no for the signed-in student.
export function isInternalStudent(studentId: string, list = process.env.INTERNAL_STUDENT_IDS): boolean {
  if (!list) return false;
  return list
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .includes(studentId.toLowerCase());
}
