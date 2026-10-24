"use client";

import BellSlash from "@gravity-ui/icons/BellSlash";
import Check from "@gravity-ui/icons/Check";
import Hourglass from "@gravity-ui/icons/Hourglass";
import ToggleOff from "@gravity-ui/icons/ToggleOff";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeniedLayout } from "@/components/denied/denied-layout";
import { Notice, OutcomeMark } from "@/components/denied/parts";
import { buttonVariants } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { ErrorMessage } from "@/components/ui/error-message";
import { StatusPill } from "@/components/ui/status-pill";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { deniedPath, ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

type View = "ask" | "approved" | "not-approved";

// After "I requested a second look" (S26, S27). The outcome screens follow
// Figma 144:2492 (B2) and 144:2541 (B3). On B3 the frame's button says "Back to
// your plan" while its note says "Review all 5 steps"; the frame wins. "Approved after review" is shown only right
// after the update is saved: the database keeps no record that an approval
// came from a second look (plan P-6, spec C6). The frames' "View application
// details" button and "Card delivery" row are left out (no such screen or data).
export function SecondLook({ applicationId, initialView = "ask" }: { applicationId: string | null; initialView?: View }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [view, setView] = useState<View>(initialView);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markApproved() {
    if (!applicationId) return;
    setPending(true);
    setError(null);
    const result = await apiRequest("patch", "/applications/{id}", {
      pathParams: { id: applicationId },
      body: { status: "approved", creditLimitCents: null },
    });
    if (!isMounted()) return;
    setPending(false);
    if (result.ok) {
      // No router.refresh() here: this page sends an approved card to Home, so
      // a refresh would replace this outcome before the student sees it. Home
      // is rendered fresh on the way there (dynamic pages are not kept in the
      // client cache, Next staleTimes.dynamic = 0).
      setView("approved");
      return;
    }
    if (isUnauthorized(result)) {
      router.replace(signInPath(ROUTES.home));
      return;
    }
    setError(
      result.kind === "api" && result.status === 409
        ? "You already have this card on Home as applied or approved, so this one can’t change. Check Home for it."
        : failureMessage(result),
    );
  }

  if (view === "approved") {
    return (
      <DeniedLayout backHref={ROUTES.home} backLabel="Home">
        <div className="flex flex-col items-center gap-4 pt-5 text-center">
          <OutcomeMark icon={Check} tone="success" />
          <StatusPill>APPROVED AFTER REVIEW</StatusPill>
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h1 font-medium text-navy">The issuer approved your application</h1>
            <p className="text-body-m text-indigo-black">
              The corrected information was reviewed. Watch for the issuer’s confirmation and card delivery details.
            </p>
          </div>
        </div>
        <dl className="flex flex-col gap-3 rounded-card border-[1.5px] border-violet p-5 text-body-s">
          <div className="flex justify-between gap-3 bg-green/35 text-indigo-black">
            <dt>Application</dt>
            <dd className="font-semibold">Approved</dd>
          </div>
        </dl>
        <Notice icon={ToggleOff} title="Nothing starts automatically">
          The rejected-card plan and card reminders remain off. Confirm that the card arrived before starting a card plan.
        </Notice>
        <Link href={ROUTES.home} className={buttonVariants()}>
          Return to Home
        </Link>
      </DeniedLayout>
    );
  }

  if (view === "not-approved") {
    return (
      <DeniedLayout backHref={deniedPath("fixable", applicationId)} backLabel="Contact the issuer">
        <div className="flex flex-col items-center gap-4 pt-5 text-center">
          <OutcomeMark icon={Hourglass} />
          <StatusPill>NOT APPROVED</StatusPill>
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h1 font-medium text-navy">The decision did not change</h1>
            <p className="text-body-m text-indigo-black">
              That’s discouraging, but your plan still works. No need to apply again now.
            </p>
          </div>
        </div>
        <Notice icon={BellSlash} title="Rejected-card features stay off" />
        <div className="flex flex-col gap-2">
          <Link href={deniedPath("reminder", applicationId)} className={buttonVariants()}>
            Set a 6-month reminder
          </Link>
          <Link href={deniedPath("plan", applicationId)} className={buttonVariants({ variant: "secondary" })}>
            Back to your plan
          </Link>
        </div>
      </DeniedLayout>
    );
  }

  return (
    <DeniedLayout backHref={deniedPath("fixable", applicationId)} backLabel="Contact the issuer">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">How did the second look go?</h1>
        <p className="text-body-m text-indigo-black">Tell us what the issuer said, and we’ll update your card.</p>
      </div>
      <div role="group" aria-label="What the issuer said" className="flex flex-col gap-4">
        <ChoiceButton disabled={pending || !applicationId} onClick={markApproved}>
          They approved it
        </ChoiceButton>
        <ChoiceButton disabled={pending} onClick={() => setView("not-approved")}>
          The decision didn’t change
        </ChoiceButton>
        <Link href={ROUTES.home} className={choiceRowClass}>
          I’m still waiting to hear
        </Link>
      </div>
      {applicationId ? null : (
        <p className="text-body-s text-indigo-black">To update a card, open this from the card on Home.</p>
      )}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </DeniedLayout>
  );
}

function ChoiceButton({ children, onClick, disabled }: { children: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(choiceRowClass, "text-left disabled:cursor-not-allowed disabled:opacity-50")}
    >
      {children}
    </button>
  );
}
