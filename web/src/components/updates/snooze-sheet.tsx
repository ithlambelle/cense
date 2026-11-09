"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { ErrorMessage } from "@/components/ui/error-message";
import { SelectionMark } from "@/components/ui/selection-mark";
import { Sheet } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import { dismiss, snooze, type SnoozeChoice } from "@/lib/api-client/updates";
import { ROUTES, signInPath, updateSnoozedPath, type ReminderKind } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type SnoozeTarget = {
  id: string;
  kind: ReminderKind;
  choices: { choice: SnoozeChoice; label: string }[];
};

// "Remind me again" (Flow B N2, Figma 477:1355): the times worked out for
// this reminder (never past its due date), the first picked, then Snooze. A
// saved snooze opens the Snoozed screen (N4). "Dismiss for this billing
// cycle" hides it until the next statement and returns to Updates. `back` is
// where a signed-out student returns after signing in.
export function SnoozeSheet({
  target,
  onClose,
  back = ROUTES.updates,
}: {
  target: SnoozeTarget | null;
  onClose: () => void;
  back?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<SnoozeChoice | null>(null);
  const [pending, setPending] = useState<"snooze" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choice = picked && target?.choices.some((c) => c.choice === picked) ? picked : (target?.choices[0]?.choice ?? null);

  function close() {
    if (pending) return;
    setPicked(null);
    setError(null);
    onClose();
  }

  async function save() {
    if (!target || !choice || pending) return;
    setPending("snooze");
    setError(null);
    const result = await snooze(target.id, choice);
    if (result.kind === "ok") {
      track("reminder_snooze_saved", { kind: target.kind, choice });
      router.push(updateSnoozedPath(target.id));
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") router.replace(signInPath(back));
    else setError(result.message);
  }

  async function dismissForCycle() {
    if (!target || pending) return;
    setPending("dismiss");
    setError(null);
    const result = await dismiss(target.id);
    if (result.kind === "ok") {
      track("reminder_dismissal_saved", { kind: target.kind });
      setPending(null);
      setPicked(null);
      onClose();
      if (back === ROUTES.updates) router.refresh();
      else router.push(ROUTES.updates);
      return;
    }
    setPending(null);
    if (result.kind === "signed-out") router.replace(signInPath(back));
    else setError(result.message);
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => (open ? undefined : close())}
      title="Remind me again"
      titleClassName="text-h4"
    >
      <div role="radiogroup" aria-label="Remind me again" className="flex flex-col gap-3">
        {target?.choices.map((option) => {
          const selected = option.choice === choice;
          return (
            <button
              key={option.choice}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPicked(option.choice)}
              className={cn(choiceRowClass, "justify-between text-left font-medium text-indigo-black", selected && "border-2")}
            >
              {option.label}
              <SelectionMark selected={selected} />
            </button>
          );
        })}
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button onClick={save} pending={pending === "snooze"} disabled={!choice || pending === "dismiss"}>
        Snooze
      </Button>
      <Button
        variant="secondary"
        size={null}
        className="h-9 self-start px-3"
        onClick={dismissForCycle}
        pending={pending === "dismiss"}
        disabled={pending === "snooze"}
      >
        Dismiss for this billing cycle
      </Button>
    </Sheet>
  );
}
