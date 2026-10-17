"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";

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
