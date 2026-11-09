"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SENSITIVE, track } from "@/lib/analytics";
import { dismiss, markPaid } from "@/lib/api-client/updates";
import { ROUTES, signInPath, updatePath } from "@/lib/routes";

import { SnoozeSheet, type SnoozeTarget } from "./snooze-sheet";

// The follow-up (Flow B N3, Figma 477:1458): 2 days after the statement
// closed and the student has not marked it paid. Cense cannot see the
// balance, so the target says "In full" where the frame draws a sample
// amount, and sends the student to their card app for the number. "I paid
// it" marks the reminder paid; Snooze opens the same sheet as Updates.
export function FollowUpView({
  id,
  cardName,
  due,
  choices,
}: {
  id: string;
  cardName: string;
  // "Dec 6", or null when the card has no due day saved.
  due: string | null;
  choices: SnoozeTarget["choices"];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"paid" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<SnoozeTarget | null>(null);
  const by = due ?? "the due date";

  async function paid() {
    if (pending) return;
    setPending("paid");
    setError(null);
    const result = await markPaid(id);
    if (result.kind === "ok") {
      track("reminder_payment_reported", { kind: "statement_closing", from: "follow_up" });
      router.push(ROUTES.updates);
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") router.replace(signInPath(updatePath(id)));
    else setError(result.message);
  }

  // With no snooze time left before it is due, Dismiss replaces Snooze.
  async function dismissForCycle() {
    if (pending) return;
    setPending("dismiss");
    setError(null);
    const result = await dismiss(id);
    if (result.kind === "ok") {
      track("reminder_dismissal_saved", { kind: "statement_closing" });
      router.push(ROUTES.updates);
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") router.replace(signInPath(updatePath(id)));
    else setError(result.message);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.updates} backLabel="Updates" />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
          <h1 className="font-heading text-h3 font-medium text-navy">Time to pay off your card</h1>
          <p className={`${SENSITIVE} text-body-s text-indigo-black`}>
            {cardName}
            {due ? ` · Due ${due}` : null}
          </p>
          <section aria-label="Pay your statement balance" className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-off-white bg-white p-5">
            <p className="text-body-s text-indigo-black">Pay your statement balance</p>
            <p className="font-number text-[36px] leading-[44px] font-semibold text-navy">In full</p>
            <p className="text-body-s text-indigo-black/75">Paying it in full by {by} avoids interest.</p>
            <p className="text-[13px] leading-[18px] text-indigo-black">Check the balance in your card app first.</p>
          </section>
          <section aria-labelledby="why-full" className="flex items-start gap-3 rounded-card bg-light-blue/50 p-[18px]">
            <Image src="/mascot/astro-pig/avatar.png" alt="" width={32} height={32} className="shrink-0" />
            <div className="flex flex-col gap-1.5">
              <h2 id="why-full" className="font-heading text-h6 font-medium text-navy">Why the full balance?</h2>
              <p className="text-body-s text-indigo-black">
                Interest only applies to what you carry past the due date. Pay the full statement balance and there is none.
              </p>
            </div>
          </section>
          <div className="flex-1" />
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <div className="flex flex-col gap-4">
            <Button onClick={paid} pending={pending === "paid"} disabled={pending === "dismiss"}>
              I paid it
            </Button>
            {choices.length > 0 ? (
              <Button variant="secondary" onClick={() => setSnoozing({ id, kind: "statement_closing", choices })} disabled={pending !== null}>
                Snooze
              </Button>
            ) : (
              <Button variant="secondary" onClick={dismissForCycle} pending={pending === "dismiss"} disabled={pending === "paid"}>
                Dismiss for this billing cycle
              </Button>
            )}
          </div>
        </main>
        <SnoozeSheet target={snoozing} onClose={() => setSnoozing(null)} back={updatePath(id)} />
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
