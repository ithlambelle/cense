import type { ApplicationDetail } from "../api/application";
import type { PlanStepName } from "../api-client/plans";

type DenialReason = NonNullable<ApplicationDetail["denialReason"]>;

// The denial plan's five steps in order, with the titles the plan screen uses
// (components/denied/plan-view.tsx, Figma 144:2062). Home names the first one
// not done as the next step. Keep the two in step until the plan screen reads
// its titles from here.
export const DENIAL_PLAN_STEPS: readonly { step: PlanStepName; title: string }[] = [
  { step: "read_letter", title: "Read the issuer’s letter" },
  { step: "check_reports", title: "Check all three credit reports" },
  { step: "pause_applications", title: "Pause new applications" },
  { step: "build_credit", title: "Build credit another way" },
  { step: "reapply", title: "Reapply in about 6 months" },
];

export function nextDenialStep(done: ReadonlySet<PlanStepName>): { step: PlanStepName; title: string } | null {
  return DENIAL_PLAN_STEPS.find(({ step }) => !done.has(step)) ?? null;
}

// The reason on Home's denied card, after "Reason: " (Figma 144:2264). The
// first three follow the choices on "Was it one of these?" (144:2014).
// "Something else" shows the student's own note when they wrote one. No
// letter yet has its own card on Home (144:2370), so it has no line.
const REASON_LINES: Record<Exclude<DenialReason, "no_letter_yet">, string> = {
  no_credit_history: "not enough credit history",
  income: "not enough income",
  could_not_verify: "couldn’t verify identity",
  report_frozen: "credit report frozen",
  something_else: "something else",
};

export function denialReasonLine(reason: DenialReason, note: string | null): string | null {
  if (reason === "no_letter_yet") return null;
  if (reason === "something_else" && note?.trim()) return note.trim();
  return REASON_LINES[reason];
}
