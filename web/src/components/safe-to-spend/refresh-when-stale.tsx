"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { refreshBank } from "@/lib/api-client/safe-to-spend";
import { isStale } from "@/lib/safe-to-spend/compute";

// The link needs the student: Home, read again, shows the notice in place of
// the number.
const BROKEN_LINK = new Set(["reconnect_needed", "relink_needed"]);

// Home shows the last numbers straight away, and when they are over an hour
// old reads the bank again in the background, then shows the new ones. If the
// bank needs the student (a new sign-in, or a new link), Home is read again
// and shows that instead of the number. Any other failure keeps the number
// but says when it was read, so it is never passed off as current.
export function RefreshWhenStale({ refreshedAt }: { refreshedAt: string | null }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isStale(refreshedAt, Date.now())) return;
    let cancelled = false;
    void refreshBank().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "ok" || (outcome.kind === "failed" && outcome.code !== null && BROKEN_LINK.has(outcome.code))) {
        router.refresh();
        return;
      }
      if (outcome.kind === "failed") setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshedAt, router]);

  if (!failed) return null;
  const read = refreshedAt
    ? new Date(refreshedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <p role="status" className="pt-1 text-caption text-white/80">
      {read ? `Couldn’t update. Last read ${read}.` : "Couldn’t update just now."}
    </p>
  );
}
