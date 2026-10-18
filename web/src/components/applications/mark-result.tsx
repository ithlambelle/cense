"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Button } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectedMark } from "@/components/ui/selected-mark";
import { TextField } from "@/components/ui/text-field";
import { SENSITIVE, track } from "@/lib/analytics";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import type { Application } from "@/lib/api/application";
import { centsToField, LIMIT_ERROR, limitToCents } from "@/lib/credit-limit";
import { applicationPath, deniedPath, ROUTES, signInPath, waitingPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";

type Choice = "approved" | "denied" | "waiting";

const CHOICES: { id: Choice; label: string }[] = [
  { id: "approved", label: "I was approved" },
  { id: "denied", label: "I was denied" },
  { id: "waiting", label: "I haven’t heard yet" },
];

// Mark what the issuer decided for one tracked card (S18), from the Updates
// card's Approved / Denied choice (Figma 416:409) and Home's "I was denied".
// "I haven't heard yet" saves nothing: there is no such status (plan P-3).
export function MarkResult({ application }: { application: Application }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  // An approved card opens on its limit, which is how Home's "Credit limit" link edits it.
  const [choice, setChoice] = useState<Choice | null>(application.status === "approved" ? "approved" : null);
  // Starts from the saved limit, so marking an approved card again never erases it.
  const [limit, setLimit] = useState(centsToField(application.creditLimitCents));
  const [limitError, setLimitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(status: "approved" | "rejected", creditLimitCents: number | null) {
    setPending(true);
    setError(null);
    const result = await apiRequest("patch", "/applications/{id}", {
      pathParams: { id: application.id },
      body: { status, creditLimitCents },
    });
    // The student left while it saved: the answer must not move them again.
    if (!isMounted()) return;
    if (!result.ok) {
      setPending(false);
      if (isUnauthorized(result)) {
        router.replace(signInPath(applicationPath(application.id)));
        return;
      }
      setError(failureMessage(result));
      return;
    }
    // The outcome only, never the credit limit.
    track("outcome_reported", { outcome: status === "approved" ? "approved" : "denied", source: "mark_result" });
    // Stays pending while the next screen loads.
    router.push(status === "rejected" ? deniedPath("options", application.id) : ROUTES.home);
    router.refresh();
  }

  function choose(next: Choice) {
    setError(null);
    if (next === "waiting") {
      track("outcome_reported", { outcome: "pending", source: "mark_result" });
      router.push(waitingPath(application.id));
      return;
    }
    setChoice(next);
  }

  function submitApproved(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const cents = limitToCents(limit);
    if (cents === undefined) {
      setLimitError(LIMIT_ERROR);
      return;
    }
    setLimitError(null);
    void save("approved", cents);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} title="Your application" />
        <main className="stagger flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">What did the issuer decide?</h1>
            <p className="text-body-m text-indigo-black">{application.cardName}</p>
          </div>

          <div role="group" aria-label="What the issuer decided" className="flex flex-col gap-4">
            {CHOICES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={choice === option.id}
                disabled={pending}
                onClick={() => choose(option.id)}
                className={cn(
                  choiceRowClass,
                  "gap-4 text-left disabled:cursor-progress",
                  choice === option.id && "bg-off-white",
                )}
              >
                <span className="flex-1">{option.label}</span>
                {choice === option.id ? <SelectedMark /> : null}
              </button>
            ))}
          </div>

          {choice === "approved" ? (
            <form method="post" onSubmit={submitApproved} className={cn(SENSITIVE, "flex flex-col gap-4")} noValidate>
              <TextField
                label="Credit limit (optional)"
                hint="You can find it in the approval email or the issuer’s app. Leave it blank if you don’t know yet."
                inputMode="numeric"
                autoComplete="off"
                placeholder="$500"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                error={limitError ?? undefined}
                disabled={pending}
              />
              <Button type="submit" pending={pending}>
                Save
              </Button>
            </form>
          ) : null}

          {choice === "denied" ? (
            <div className="flex flex-col gap-3 rounded-card border border-hairline p-5">
              <p className="text-body-m text-navy">Mark {application.cardName} as denied?</p>
              <p className="text-body-s text-indigo-black">We’ll then show you calm next steps for a denial.</p>
              <Button pending={pending} onClick={() => void save("rejected", null)}>
                Yes, mark as denied
              </Button>
            </div>
          ) : null}

          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
