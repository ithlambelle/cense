"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { minusMoney, PreviewLabel, signedMoney } from "@/components/safe-to-spend/parts";
import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Sheet } from "@/components/ui/sheet";
import { SENSITIVE } from "@/lib/analytics";
import {
  createLinkToken,
  disconnectBank,
  refreshBank,
  type SafeToSpendData,
} from "@/lib/api-client/safe-to-spend";
import { moneyAmount } from "@/lib/money";
import { openLink } from "@/lib/plaid/link";
import { ROUTES, safeToSpendSetupPath, signInPath } from "@/lib/routes";
import { BILL_COPY, COVERED_BY_LABELS, SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const KIND_NOTE = { cash: "Counted", card: "Owed", other: "Not counted" } as const;

type Note = { kind: "info" | "error"; text: string } | null;

// "How we got this" (US-12): every step of the sum in plain words, the
// accounts it came from, the student's answers, and the controls for the
// link: read again, sign in to the bank again, disconnect. Not drawn in
// Figma; built from the system's list rows, type and buttons.
export function HowView({ data }: { data: SafeToSpendData }) {
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
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "ok" || result.code === "reconnect_needed") {
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
    if (token.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (token.kind === "failed") return finish({ kind: "error", text: token.message });
    const outcome = await openLink(token.data.linkToken);
    if (outcome.kind === "cancelled") return finish({ kind: "info", text: "Your bank is still waiting for you to sign in." });
    if (outcome.kind !== "connected") return finish({ kind: "error", text: "The bank connection didn’t finish. Please try again." });
    const result = await refreshBank();
    if (result.kind === "signed-out") return router.replace(signInPath(ROUTES.safeToSpend));
    if (result.kind === "failed") return finish({ kind: "error", text: result.message });
    router.refresh();
    finish(null);
  }

  const reconnectNeeded = data.status === "reconnect_needed";
  const refreshed =
    now && data.refreshedAt
      ? new Date(data.refreshedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} backLabel="Home" />
        <main className="flex flex-1 flex-col gap-5 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2">
              <PreviewLabel />
              <span className="text-[13px] leading-[18px] text-indigo-black/75">{SAFE_TO_SPEND_COPY.sandboxNote}</span>
            </p>
            <h1 className="font-heading text-h3 font-medium text-navy">{SAFE_TO_SPEND_COPY.howTitle}</h1>
            <p className="text-body-s text-indigo-black/70">{SAFE_TO_SPEND_COPY.howIntro}</p>
          </div>

          {reconnectNeeded ? (
            <section aria-label="Reconnect" className="flex flex-col gap-3 rounded-card bg-off-white p-5">
              <p className="text-body-m text-navy">{SAFE_TO_SPEND_COPY.reconnect}</p>
              <p className="text-body-s text-indigo-black/70">Until then, these are the last numbers we read.</p>
              <Button type="button" pending={busy === "reconnect"} onClick={reconnect}>
                Reconnect your bank
              </Button>
            </section>
          ) : null}

          {note?.kind === "error" ? <ErrorMessage>{note.text}</ErrorMessage> : null}
          {note?.kind === "info" ? (
            <p role="status" className="text-body-s text-indigo-black">
              {note.text}
            </p>
          ) : null}

          {/* The student's own money: masked in session replay. */}
          <ul aria-label="The sum" className={cn(SENSITIVE, "flex flex-col rounded-card border border-hairline px-5 py-2")}>
            <SumRow label="Cash in checking" value={moneyAmount(data.cashCents)} />
            <SumRow label="Card balances" value={minusMoney(data.cardCents)} />
            <SumRow label="Bills you cover" value={minusMoney(data.billsCents)} />
            <SumRow label="Set aside" value={minusMoney(data.setAsideCents)} />
            <SumRow label={`Left for ${data.days} days`} value={signedMoney(data.leftCents)} divided />
            <SumRow label="Safe to spend a day" value={moneyAmount(data.dailyCents)} strong />
          </ul>
          {data.leftCents < 0 ? (
            <p className="text-body-s text-indigo-black">Your card balances and bills are more than your checking, so there’s nothing safe to spend yet.</p>
          ) : null}

          <section aria-labelledby="accounts-heading" className="flex flex-col gap-2">
            <h2 id="accounts-heading" className={cn(SENSITIVE, "font-heading text-h6 font-medium text-navy")}>
              From {data.institutionName}
            </h2>
            <ul aria-label={`Accounts from ${data.institutionName}`} className={cn(SENSITIVE, "flex flex-col")}>
              {data.accounts.map((account) => (
                <li key={`${account.name}-${account.mask}`} className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0">
                  <span className="min-w-0 text-body-s text-indigo-black">
                    {account.name}
                    {account.mask ? <span className="text-indigo-black/70"> ••{account.mask}</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-number text-number-m text-navy">{signedMoney(account.balanceCents)}</span>
                    <span className="text-caption text-indigo-black/70">{KIND_NOTE[account.kind]}</span>
                  </span>
                </li>
              ))}
            </ul>
            {data.accounts.length === 0 ? <p className="text-body-s text-indigo-black">No balances read yet.</p> : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-indigo-black/70" suppressHydrationWarning>
                {refreshed ? `Updated ${refreshed}` : ""}
              </p>
              <Button type="button" variant="secondary" className="w-auto px-0" pending={busy === "refresh"} onClick={refresh}>
                Refresh
              </Button>
            </div>
          </section>

          <section aria-labelledby="answers-heading" className="flex flex-col gap-2">
            <h2 id="answers-heading" className="font-heading text-h6 font-medium text-navy">
              Your bills
            </h2>
            <ul aria-label="Your answers" className={cn(SENSITIVE, "flex flex-col")}>
              {data.bills.map((answer) => (
                <li key={answer.bill} className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0 text-body-s text-indigo-black">
                  <span>{BILL_COPY[answer.bill].label}</span>
                  <span>
                    {COVERED_BY_LABELS[answer.coveredBy]}
                    {answer.monthlyCents !== null ? `, ${moneyAmount(answer.monthlyCents)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={safeToSpendSetupPath()}
              className="min-h-11 content-center self-start text-body-s font-semibold text-violet underline underline-offset-2 outline-none hover:text-violet-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              Change your answers
            </Link>
          </section>

          <Button type="button" variant="outline" onClick={() => setSheetOpen(true)}>
            Disconnect bank
          </Button>
        </main>
        <DisconnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}

function SumRow({ label, value, divided = false, strong = false }: { label: string; value: string; divided?: boolean; strong?: boolean }) {
  return (
    <li className={cn("flex items-center justify-between gap-3 py-2.5", divided && "mt-1 border-t border-hairline pt-3.5")}>
      <span className={cn("text-body-s text-indigo-black", strong && "font-semibold text-navy")}>{label}</span>
      <span className={cn("font-number text-navy", strong ? "text-number-l font-medium text-violet" : "text-number-m")}>{value}</span>
    </li>
  );
}

// Disconnect (US-12): Plaid removes the Item first, then Cense deletes the
// token, balances and answers. If Plaid cannot be reached nothing changes.
function DisconnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
      router.replace(signInPath(ROUTES.safeToSpend));
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
      description="We remove the connection and delete your balances and answers."
    >
      <p className="text-body-s text-indigo-black">
        Plaid keeps its own copy of what it shared. Manage it at{" "}
        <a
          href="https://my.plaid.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          my.plaid.com
        </a>
        .
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button type="button" pending={pending} onClick={disconnect}>
        Disconnect
      </Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
        Keep it
      </Button>
    </Sheet>
  );
}
