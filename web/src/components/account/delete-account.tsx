"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { forgetTabState } from "@/components/account/log-out-button";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Sheet } from "@/components/ui/sheet";
import { forgetDeletedStudent, pauseAnalytics } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";

// What a deletion removes, in three lines (the in-app notice cap). Analytics
// "follow": PostHog queues their deletion, inside the policy's 30 days.
// "Cards you track", so no one fears their real card is closed.
const WHAT_GOES = [
  "Cards you track, quiz answers, plans and reminders are deleted now.",
  "Your analytics and screen recordings follow within 30 days.",
  "This can’t be undone.",
];

// The sheet opens under the finger that tapped "Delete my account", so a tap
// on Delete this soon after is the same tap landing twice, not a choice.
const CONFIRM_GUARD_MS = 600;

// When deleting keeps failing (a missing setting, PostHog down), the way that
// needs no app (privacy policy, "Your choices and rights").
const PRIVACY_EMAIL = "privacy@censefinance.com";

// Delete my account (S28): a text action at the foot of Security and privacy,
// as "Turn off all reminders" is on Reminder settings (222:2377), and a sheet
// to confirm. Analytics stops, and its queue is sent, before the request, so
// nothing under the student's id reaches PostHog after it is asked to delete
// them; it resumes only if the deletion fails. The confirm button is left out
// of autocapture ("ph-no-capture") for the same reason. Keeping the account
// is the main button and sits on top, where the tap that opened the sheet
// lands; Delete sits below it and ignores taps for CONFIRM_GUARD_MS.
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(0);

  function openSheet() {
    openedAt.current = Date.now();
    setOpen(true);
  }

  async function confirm() {
    if (pending || Date.now() - openedAt.current < CONFIRM_GUARD_MS) return;
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
      <Button variant="link" className="text-body-m font-semibold" onClick={openSheet}>
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
        {error ? (
          <div className="flex flex-col gap-1">
            <ErrorMessage>{error}</ErrorMessage>
            <p className="text-body-s text-indigo-black">
              Still not working? Email{" "}
              <a
                href={`mailto:${PRIVACY_EMAIL}`}
                className="text-violet underline underline-offset-2 hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-ring"
              >
                {PRIVACY_EMAIL}
              </a>{" "}
              and we’ll delete it for you.
            </p>
          </div>
        ) : null}
        <Button chevron={false} disabled={pending} onClick={() => setOpen(false)}>
          Keep my account
        </Button>
        <Button variant="secondary" className="ph-no-capture" pending={pending} onClick={confirm}>
          Delete my account
        </Button>
      </Sheet>
    </>
  );
}
