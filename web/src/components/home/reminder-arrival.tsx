"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";
import { REMINDER_PARAM, type ReminderKind } from "@/lib/routes";

// Once per page load: Back to Home within the app can mount this again.
let counted = false;

// A visit from a reminder email's Open Cense button (/home?reminder=<kind>):
// counted once as reminder_email_clicked, then the mark is dropped from the
// address so a reload or Back is calm and not counted again. Renders nothing.
export function ReminderArrival({ kind }: { kind: ReminderKind }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!counted && url.searchParams.get(REMINDER_PARAM) === kind) {
      counted = true;
      track("reminder_email_clicked", { kind });
    }
    url.searchParams.delete(REMINDER_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [kind]);
  return null;
}
