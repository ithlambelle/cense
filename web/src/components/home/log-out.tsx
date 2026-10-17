"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BackLink } from "@/components/ui/back-link";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ScreenShell } from "@/components/ui/screen-shell";
import { apiRequest, failureMessage } from "@/lib/api-client/client";
import { ROUTES } from "@/lib/routes";

export function AccountScreen() {
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
    <ScreenShell nav={<BottomNav />}>
      <BackLink href={ROUTES.home} />
      <h1 className="mt-3 font-heading text-title font-bold">Your account</h1>
      <p className="mt-2 text-body text-muted-foreground">
        Logging out keeps your answers and your card match saved for next time.
      </p>
      <Button variant="secondary" className="mt-8" pending={pending} onClick={logOut}>
        Log out
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-center text-label text-destructive">
          {error}
        </p>
      ) : null}
    </ScreenShell>
  );
}
