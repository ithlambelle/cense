import { createStudentClient } from "@/lib/supabase/server";

export async function authenticatedStudent() {
  const supabase = await createStudentClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return { supabase, studentId: data.user.id, email: data.user.email ?? null };
}
