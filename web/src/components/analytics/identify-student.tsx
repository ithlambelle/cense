"use client";

import { useEffect } from "react";

import { identify } from "@/lib/analytics";

// Links this browser's analytics to the signed-in student, by Supabase user id
// only (never email). The id comes from requireStudent on the server.
export function IdentifyStudent({ studentId }: { studentId: string }) {
  useEffect(() => {
    identify(studentId);
  }, [studentId]);
  return null;
}
