"use client";

import Link from "next/link";
import { useEffect } from "react";

import { MessageScreen } from "@/components/shell/message-screen";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";
import { ROUTES } from "@/lib/routes";

// Shown when a page fails to render. Never shows the error itself.
// `retry` is the Next 16.3 error boundary prop (re-fetches and re-renders).
export default function ErrorPage({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    reportError("page", error);
  }, [error]);

  return (
    <MessageScreen title="Something went wrong" body="It’s on our side, not yours. Please try again.">
      <Button onClick={retry}>Try again</Button>
      <Link href={ROUTES.cards} className={buttonVariants({ variant: "secondary" })}>
        Browse cards
      </Link>
    </MessageScreen>
  );
}
