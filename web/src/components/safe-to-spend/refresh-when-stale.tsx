"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { refreshBank } from "@/lib/api-client/safe-to-spend";
import { isStale } from "@/lib/safe-to-spend/compute";

// Home shows the last numbers straight away, and when they are over an hour
// old reads the bank again in the background, then shows the new ones. A
// failed read leaves the old numbers; one that finds the bank needs a new
// sign-in shows that instead.
export function RefreshWhenStale({ refreshedAt }: { refreshedAt: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (!isStale(refreshedAt, Date.now())) return;
    let cancelled = false;
    void refreshBank().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "ok" || (outcome.kind === "failed" && outcome.code === "reconnect_needed")) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshedAt, router]);
  return null;
}
