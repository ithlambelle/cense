"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { resetAnalytics } from "@/lib/analytics";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";

// Per-tab notes such as "waiting to hear if you finished applying" belong to
// the student who left; the next person on this tab must not inherit them.
// Delete my account clears them too.
export function forgetTabState() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("cense:")) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be off; nothing was kept then.
  }
}

// Logging out keeps answers and cards saved for next time. Flow F, F5 and F8
// (Figma 477:2822, 477:2942): Log out is a full-width outlined button with
// Switch account under it; both end on the signed-out "Welcome back" screen,
// where Google always asks which account (prompt=select_account).
export function LogOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState<"log-out" | "switch" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function logOut(kind: "log-out" | "switch") {
    setPending(kind);
    setError(null);
    const result = await apiRequest("post", "/auth/logout");
    if (!result.ok) {
      setPending(null);
      setError(failureMessage(result));
      return;
    }
    forgetTabState();
    resetAnalytics();
    router.replace(ROUTES.signIn);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        chevron={false}
        className="text-button text-violet"
        onClick={() => logOut("log-out")}
        disabled={pending !== null}
        pending={pending === "log-out"}
      >
        {pending === "log-out" ? "Logging out…" : "Log out"}
      </Button>
      <Button
        variant="secondary"
        className="w-auto px-3"
        onClick={() => logOut("switch")}
        disabled={pending !== null}
        pending={pending === "switch"}
      >
        Switch account
      </Button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
