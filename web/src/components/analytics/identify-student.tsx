"use client";

import { useEffect } from "react";

import { identify } from "@/lib/analytics";

// Links this browser's analytics to the signed-in student, by Supabase user id
// only (never email), unless the student turned analytics off. Every value
// comes from the server: the id from the session, isInternal from the team
// list in lib/internal-students.ts, analyticsOn from the profile
// (lib/analytics-choice.ts).
export function IdentifyStudent({
  studentId,
  isInternal,
  analyticsOn,
}: {
  studentId: string;
  isInternal: boolean;
  analyticsOn: boolean | null;
}) {
  useEffect(() => {
    identify(studentId, isInternal, analyticsOn);
  }, [studentId, isInternal, analyticsOn]);
  return null;
}
