"use client";

// Created with Claude Code (2026-11-13), moved from the old How we got this
// page. Disconnect (Figma E3, 709:1664) never waits on Plaid (Ben, Nov 18):
// Cense deletes the token, balances, transactions, answers and budget
// amounts at once, and an Item Plaid could not remove is queued and removed
// at Plaid later by the daily job (web/src/lib/plaid/unlink.ts). The first
// line keeps "transactions", which the frame's 709:1666 leaves out, because
// they are deleted too.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Sheet } from "@/components/ui/sheet";
import { disconnectBank } from "@/lib/api-client/safe-to-spend";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

const LINK = "text-violet underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

export function DisconnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await disconnectBank();
    if (!isMounted()) return;
    if (result.kind === "ok" || (result.kind === "failed" && result.code === "not_linked")) {
      router.replace(ROUTES.home);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.kind === "signed-out") {
      router.replace(signInPath(ROUTES.accounts));
      return;
    }
    setError(result.message);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        onOpenChange(next);
      }}
      title="Disconnect your bank?"
      titleClassName="text-h4 font-semibold"
    >
      {/* Three lines (709:1666 to 709:1668), Inter 14. */}
      <ul className="-mt-1 flex flex-col gap-3 text-body-s text-indigo-black">
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>We delete your balances, transactions and answers now.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>We remove the link at Plaid after. If Plaid is down, we retry.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>
            Plaid keeps its own copy. Manage it at{" "}
            <a href="https://my.plaid.com" target="_blank" rel="noopener noreferrer" className={LINK}>
              my.plaid.com
            </a>
            .
          </span>
        </li>
      </ul>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button type="button" pending={pending} onClick={disconnect}>
        Disconnect
      </Button>
      <Button type="button" variant="secondary" className="-mt-1 h-9 w-auto self-start px-3" disabled={pending} onClick={() => onOpenChange(false)}>
        Keep it
      </Button>
    </Sheet>
  );
}
