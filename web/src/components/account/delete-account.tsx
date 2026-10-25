"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { forgetTabState } from "@/components/account/log-out-button";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Sheet } from "@/components/ui/sheet";
import { forgetDeletedStudent, pauseAnalytics } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";

// What a deletion removes, in three lines (the in-app notice cap).
const WHAT_GOES = [
  "Your cards, quiz answers, plans and reminders are deleted now.",
  "So are your analytics and screen recordings.",
  "This can’t be undone.",
];

// Delete my account (S28): a text action at the foot of Security and privacy,
// as "Turn off all reminders" is on Reminder settings (222:2377), and a sheet
// to confirm. Analytics stops, and its queue is sent, before the request, so
// nothing under the student's id reaches PostHog after it is asked to delete
// them; it resumes only if the deletion fails. The confirm button is left out
// of autocapture ("ph-no-capture") for the same reason.
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    const resume = await pauseAnalytics();
    const result = await apiRequest("delete", "/me");
    if (result.ok) {
      forgetTabState();
      forgetDeletedStudent();
      router.replace(ROUTES.accountDeleted);
      router.refresh();
      return;
    }
    resume();
    setPending(false);
    if (isUnauthorized(result)) router.replace(signInPath(ROUTES.home));
    else setError(failureMessage(result));
  }

  return (
    <>
      {/* As 222:2377: Inter SemiBold 16/24, Amethyst, underlined, centered. */}
      <Button variant="link" className="text-body-m font-semibold" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          // It cannot be closed while the deletion is under way.
          if (!pending) {
            setOpen(next);
            setError(null);
          }
        }}
        title="Delete your account?"
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-m text-indigo-black marker:text-violet">
          {WHAT_GOES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <Button chevron={false} className="ph-no-capture" pending={pending} onClick={confirm}>
          Delete my account
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Keep my account
        </Button>
      </Sheet>
    </>
  );
}
