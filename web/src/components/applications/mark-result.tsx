"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectedMark } from "@/components/ui/selected-mark";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import type { Application } from "@/lib/home/state";
import { applicationPath, ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Choice = "approved" | "denied" | "waiting";

const CHOICES: { id: Choice; label: string }[] = [
  { id: "approved", label: "I was approved" },
  { id: "denied", label: "I was denied" },
  { id: "waiting", label: "I haven’t heard yet" },
];

// The largest limit accepted, in whole dollars. Well above student card limits;
// it only catches typing mistakes such as an extra zero run.
const MAX_LIMIT_DOLLARS = 100_000;

// Parses "$1,500", "1500" or "500.00" to cents. Null for empty; undefined when
// it is not a limit (bad comma grouping, more than 2 decimals, under $1, too large).
export function limitToCents(value: string): number | null | undefined {
  const cleaned = value.trim().replace(/^\$\s*/, "");
  if (cleaned === "") return null;
  if (!/^(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const cents = Math.round(Number(cleaned.replace(/,/g, "")) * 100);
  if (cents < 100 || cents > MAX_LIMIT_DOLLARS * 100) return undefined;
  return cents;
}

function centsToField(cents: number | null): string {
  if (cents === null) return "";
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

// Mark what the issuer decided for one tracked card (S18), from the Updates
// card's Approved / Denied choice (Figma 416:409) and Home's "I was denied".
// "I haven't heard yet" saves nothing: there is no such status (plan P-3).
export function MarkResult({ application }: { application: Application }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
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
    if (!result.ok) {
      setPending(false);
      if (isUnauthorized(result)) {
        router.replace(signInPath(applicationPath(application.id)));
        return;
      }
      setError(failureMessage(result));
      return;
    }
    // Stays pending while the next screen loads.
    router.push(status === "rejected" ? `${ROUTES.denied}?application=${encodeURIComponent(application.id)}` : ROUTES.home);
    router.refresh();
  }

  function choose(next: Choice) {
    setError(null);
    if (next === "waiting") {
      router.push(`${applicationPath(application.id)}/waiting`);
      return;
    }
    setChoice(next);
  }

  function submitApproved(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const cents = limitToCents(limit);
    if (cents === undefined) {
      setLimitError("Enter the limit in dollars, like 500 or 1,500.");
      return;
    }
    setLimitError(null);
    void save("approved", cents);
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.home} title="Your application" />
        <main className="flex flex-1 flex-col gap-6 px-6 pt-4 pb-6">
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
                  "flex min-h-14 w-full items-center gap-4 rounded-[18px] border-[1.5px] border-violet bg-white px-5 py-3 text-left text-body-m text-navy outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress",
                  choice === option.id && "bg-off-white",
                )}
              >
                <span className="flex-1">{option.label}</span>
                {choice === option.id ? <SelectedMark /> : null}
              </button>
            ))}
          </div>

          {choice === "approved" ? (
            <form method="post" onSubmit={submitApproved} className="flex flex-col gap-4" noValidate>
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
      </div>
    </div>
  );
}
