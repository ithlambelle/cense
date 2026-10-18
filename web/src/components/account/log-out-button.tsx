"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { resetAnalytics } from "@/lib/analytics";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";

// Per-tab notes such as "waiting to hear if you finished applying" belong to
// the student who left; the next person on this tab must not inherit them.
function forgetTabState() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("cense:")) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be off; nothing was kept then.
  }
}

// Logging out keeps answers and cards saved for next time.
export function LogOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logOut() {
    setPending(true);
    setError(null);
    const result = await apiRequest("post", "/auth/logout");
    if (!result.ok) {
      setPending(false);
      setError(failureMessage(result));
      return;
    }
    forgetTabState();
    resetAnalytics();
    router.replace(ROUTES.welcome);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-5">
      <button
        type="button"
        onClick={logOut}
        disabled={pending}
        aria-busy={pending || undefined}
        className="min-h-11 text-body-s text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress"
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
