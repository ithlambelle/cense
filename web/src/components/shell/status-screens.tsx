import type { ReactNode } from "react";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { ScreenShell } from "@/components/ui/screen-shell";

export function LoadingScreen({ label, nav }: { label: string; nav?: ReactNode }) {
  return (
    <ScreenShell nav={nav}>
      <p role="status" className="mt-15 text-body text-muted-foreground">
        {label}
      </p>
    </ScreenShell>
  );
}

type FailedScreenProps = {
  title: string;
  message: string;
  onRetry: () => void;
  nav?: ReactNode;
  // False on the card list itself, where the link would lead back here.
  offerCards?: boolean;
};

export function FailedScreen({ title, message, onRetry, nav, offerCards = true }: FailedScreenProps) {
  return (
    <ScreenShell
      nav={nav}
      footer={
        <>
          <Button onClick={onRetry}>Try again</Button>
          {nav || !offerCards ? null : (
            <Link href={ROUTES.cards} className={buttonVariants({ variant: "link", className: "self-center" })}>
              Browse cards
            </Link>
          )}
        </>
      }
    >
      <h1 className="mt-15 font-heading text-title font-bold">{title}</h1>
      <p role="alert" className="mt-2 text-body text-muted-foreground">
        {message}
      </p>
    </ScreenShell>
  );
}
