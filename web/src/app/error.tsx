"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";
import { ROUTES } from "@/lib/routes";
import { ScreenShell } from "@/components/ui/screen-shell";

// Shown when a page fails to render. Never shows the error itself.
export default function ErrorPage({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    reportError("page", error);
  }, [error]);

  return (
    <ScreenShell
      footer={
        <>
          <Button onClick={retry}>Try again</Button>
          <Link href={ROUTES.cards} className={buttonVariants({ variant: "link", className: "self-center" })}>
            Browse cards
          </Link>
        </>
      }
    >
      <h1 className="mt-15 font-heading text-title font-bold">Something went wrong</h1>
      <p className="mt-2 text-body text-muted-foreground">It’s on our side, not yours. Please try again.</p>
    </ScreenShell>
  );
}
