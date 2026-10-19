import type { Student } from "@/lib/api/auth";

// The student's name, or null when they have not added one. Also null if it
// cannot be read: the name is a nicety, so a failed read never blocks a screen.
export async function readDisplayName(student: Student): Promise<string | null> {
  const { data, error } = await student.supabase
    .from("profiles")
    .select("display_name")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({ event: "profile_read_failed", code: error.code }));
    return null;
  }
  return (data?.display_name as string | null | undefined) ?? null;
}
