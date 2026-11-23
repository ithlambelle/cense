"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { browserAsksNotToTrack, identify } from "@/lib/analytics";
import { apiRequest } from "@/lib/api-client/client";

// Links this browser's analytics to the signed-in student, by Supabase user id
// only (never email), unless the student turned analytics off. Every value
// comes from the server: the id from the session, isInternal from the team
// list in lib/internal-students.ts, analyticsOn from the profile
// (lib/analytics-choice.ts).
//
// A browser that sends Global Privacy Control (or Do Not Track) also turns the
// student's saved Analytics switch off, so the few events our server sends
// (reminder sent, unsubscribed) stop too, not only the browser's own. A signed
// in student is known to us, so the signal applies to their account (CCPA
// regulations, 11 CCR 7025(c)). They can turn it back on from a browser
// without the signal; the next visit from this browser turns it off again.
export function IdentifyStudent({
  studentId,
  isInternal,
  analyticsOn,
}: {
  studentId: string;
  isInternal: boolean;
  analyticsOn: boolean | null;
}) {
  const router = useRouter();

  useEffect(() => {
    identify(studentId, isInternal, analyticsOn);
  }, [studentId, isInternal, analyticsOn]);

  useEffect(() => {
    if (analyticsOn !== true || !browserAsksNotToTrack()) return;
    let live = true;
    apiRequest("patch", "/me/privacy", { body: { analyticsOn: false } }).then((result) => {
      // Signed-in pages read the switch on the server: show the saved value.
      if (live && result.ok) router.refresh();
    });
    return () => {
      live = false;
    };
  }, [analyticsOn, router]);

  return null;
}
