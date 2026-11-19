import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { choiceRowClass } from "@/components/ui/choice-row";
import { SENSITIVE } from "@/lib/analytics";
import { quizPath, ROUTES } from "@/lib/routes";

// Created with Claude Code (2026-11-19). N3, Your next step without a bank
// (Flow 1, Figma 821:8701): skipping the bank link still gets a next step.
// One question stands in for what the bank would have told us, and tapping an
// answer moves on: "Not yet" opens the card quiz, "Yes, I have one" opens Add
// a card you already have. The answers are the app's shared answer card
// (choice-row), so the Design System Choice card restyle (G1) reaches them
// with every other answer in the app.
export const NEXT_STEP_COPY = {
  eyebrow: "Your next step",
  title: "Do you have a credit card yet?",
  body: "So we know where to start. You can link your bank later from Profile.",
  notYet: "Not yet",
  yes: "Yes, I have one",
} as const;

export function NextStepNoBank({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={backHref} backLabel={backLabel} />
        <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
          {/* Inter Semi Bold 13, Amethyst, in capitals as drawn (821:8712). */}
          <p className="text-[13px] leading-[normal] font-semibold text-violet uppercase">{NEXT_STEP_COPY.eyebrow}</p>
          <h1 id="next-step-title" className="font-heading text-h1 font-medium text-navy">
            {NEXT_STEP_COPY.title}
          </h1>
          <p className="text-body-m text-indigo-black">{NEXT_STEP_COPY.body}</p>
          {/* The answer says whether the student has a card: masked in
              session replay and kept out of autocapture, as the quiz's are. */}
          <ul aria-labelledby="next-step-title" className={`${SENSITIVE} flex flex-col gap-4`}>
            <li>
              <Link href={quizPath("start")} className={choiceRowClass}>
                {NEXT_STEP_COPY.notYet}
              </Link>
            </li>
            <li>
              <Link href={ROUTES.addCard} className={choiceRowClass}>
                {NEXT_STEP_COPY.yes}
              </Link>
            </li>
          </ul>
        </main>
      </div>
    </div>
  );
}
