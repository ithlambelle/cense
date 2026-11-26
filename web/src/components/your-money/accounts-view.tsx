"use client";

// Created with Claude Code (2026-11-13). Accounts (Figma E4, 709:1609): the
// linked bank, Refresh now, Change your answers and Disconnect bank, opened
// from Profile once a bank is linked. Disconnect is rare and serious, so it
// lives here and not on Your money (Ben, Nov 4). The controls moved here from
// the old How we got this page; what they do is unchanged.
import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DisconnectSheet } from "@/components/your-money/disconnect-sheet";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE } from "@/lib/analytics";
import { createLinkToken, disconnectBank, refreshBank, type SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { openLink } from "@/lib/plaid/link";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

type Note = { kind: "info" | "error"; text: string } | null;

const KIND_WORDS = { cash: "checking", other: "savings", card: "credit card" } as const;

// "Checking and credit card" (709:1615), from the accounts read.
export function accountKinds(data: Pick<SafeToSpendData, "accounts">): string {
  const words = (["cash", "other", "card"] as const).filter((kind) => data.accounts.some((account) => account.kind === kind)).map((kind) => KIND_WORDS[kind]);
  if (words.length === 0) return "";
  const joined = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return joined[0].toUpperCase() + joined.slice(1);
}

// List row, Divider, Leading None (371:3199): 14px above and below, an
// Off-white line, the title Medium 16, the subtitle 14 at 70%.
const ROW = "flex w-full items-center gap-3 border-b border-off-white py-3.5 text-left";
const ROW_ACTION = `${ROW} hover:bg-off-white/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-progress`;

function RowCopy({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
      <span className="text-body-m leading-[normal] font-medium text-indigo-black">{title}</span>
      {subtitle ? <span className="text-body-s leading-[normal] text-indigo-black/70">{subtitle}</span> : null}
    </span>
  );
}

function Chevron() {
  return <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-indigo-black" />;
}

// canLink: a new link may be made (always in the sandbox; in the production
// pilot only with room left). canUpdate: the student may sign in to the bank
// again (Plaid's update mode). When neither fixes a broken link, Accounts says
// who can, and offers Disconnect only.
export function AccountsView({ data, canLink = true, canUpdate = true, sandbox = true }: { data: SafeToSpendData; canLink?: boolean; canUpdate?: boolean; sandbox?: boolean }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const now = useNow();
  const [busy, setBusy] = useState<"refresh" | "reconnect" | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function finish(next: Note) {
    if (!isMounted()) return;
    setBusy(null);
    setNote(next);
  }

  async function refresh() {
    if (busy) return;
    setBusy("refresh");
    setNote(null);
    const result = await refreshBank();
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.accounts));
    if (result.kind === "ok" || result.code === "reconnect_needed" || result.code === "relink_needed") {
      router.refresh();
      return finish(null);
    }
    finish({ kind: "error", text: result.message });
  }

  // Link in update mode: the same bank and Item, signed in again.
  async function reconnect() {
    if (busy) return;
    setBusy("reconnect");
    setNote(null);
    const token = await createLinkToken();
    if (token.kind === "signed-out") return router.replace(signInPath(ROUTES.accounts));
    if (token.kind === "failed") return finish({ kind: "error", text: token.message });
    const outcome = await openLink(token.data.linkToken);
    if (outcome.kind === "cancelled") return finish({ kind: "info", text: "Your bank is still waiting for you to sign in." });
    if (outcome.kind !== "connected") return finish({ kind: "error", text: "The bank connection didn’t finish. Please try again." });
    const result = await refreshBank();
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.accounts));
    if (result.kind === "failed") return finish({ kind: "error", text: result.message });
    router.refresh();
    finish(null);
  }

  // The Item is gone at Plaid: only a new link helps, so Connect again
  // disconnects the dead one (deleting what Cense kept) and opens consent.
  async function connectAgain() {
    if (busy) return;
    setBusy("reconnect");
    setNote(null);
    const result = await disconnectBank();
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.accounts));
    if (result.kind === "ok" || result.code === "not_linked") return router.replace(ROUTES.safeToSpendConnect);
    finish({ kind: "error", text: result.message });
  }

  const reconnectNeeded = data.status === "reconnect_needed";
  const relinkNeeded = data.status === "relink_needed";
  const canFix = reconnectNeeded ? canUpdate : canLink;
  const updated =
    now && data.refreshedAt
      ? `Updated ${new Date(data.refreshedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : null;
  const subtitle = [accountKinds(data), updated].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.settings} backLabel="Your account" />
        <main className="flex flex-1 flex-col gap-3 px-6 pt-3 pb-6">
          <h1 className="font-heading text-h1 font-semibold text-navy">Accounts</h1>
          <ul aria-label="Your bank" className="flex flex-col">
            <li className={cn(ROW, SENSITIVE)}>
              <span suppressHydrationWarning className="contents">
                <RowCopy title={data.institutionName} subtitle={subtitle} />
              </span>
            </li>
            {reconnectNeeded || relinkNeeded ? (
              <li className="flex flex-col gap-3 border-b border-off-white py-3.5">
                <p className="text-body-m text-navy">{reconnectNeeded ? SAFE_TO_SPEND_COPY.reconnect : SAFE_TO_SPEND_COPY.relink}</p>
                {canFix ? (
                  <Button type="button" pending={busy === "reconnect"} onClick={reconnectNeeded ? reconnect : connectAgain}>
                    {reconnectNeeded ? "Reconnect your bank" : "Connect again"}
                  </Button>
                ) : (
                  <p className="text-body-s text-indigo-black">{SAFE_TO_SPEND_COPY.pilotNoRoom}</p>
                )}
              </li>
            ) : null}
            <li>
              <button type="button" className={ROW_ACTION} disabled={busy !== null} aria-busy={busy === "refresh" || undefined} onClick={refresh}>
                <RowCopy title={busy === "refresh" ? "Refreshing…" : "Refresh now"} />
                <Chevron />
              </button>
            </li>
            <li>
              <Link href={safeToSpendSetupPath()} className={ROW_ACTION}>
                <RowCopy title="Change your answers" subtitle="Who covers your bills" />
                <Chevron />
              </Link>
            </li>
          </ul>
          {note?.kind === "error" ? <ErrorMessage>{note.text}</ErrorMessage> : null}
          {note?.kind === "info" ? (
            <p role="status" className="text-body-s text-indigo-black">
              {note.text}
            </p>
          ) : null}
          <div className="min-h-6 flex-1" />
          <Button type="button" variant="outline" chevron={false} className="text-button text-violet" onClick={() => setSheetOpen(true)}>
            Disconnect bank
          </Button>
        </main>
        <DisconnectSheet open={sheetOpen} onOpenChange={setSheetOpen} lastLink={!sandbox && !canLink} />
      </div>
    </div>
  );
}
