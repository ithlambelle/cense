"use client";

import { useEffect } from "react";

import { identify } from "@/lib/analytics";

// Links this browser's analytics to the signed-in student, by Supabase user id
// only (never email). Both values come from the server: the id from the
// session, isInternal from the team list in lib/internal-students.ts.
export function IdentifyStudent({ studentId, isInternal }: { studentId: string; isInternal: boolean }) {
  useEffect(() => {
    identify(studentId, isInternal);
  }, [studentId, isInternal]);
  return null;
}
