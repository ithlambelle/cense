import ArrowRight from "@gravity-ui/icons/ArrowRight";
import Image from "next/image";

import { BottomNav } from "@/components/ui/bottom-nav";
import { ProgressBar } from "@/components/ui/progress-bar";

const PENNY_STARTERS = ["How to use a credit card?", "How to budget as a student?"];
const TOPICS = ["Credit", "Budgeting", "Saving", "Student loans"];
const CREDIT_BASICS_LESSONS = 5;

// The Learn tab, drawn from the designers' Learn frame (Figma 294:3966).
// Lessons and Ask Penny are not built yet, so nothing here pretends to work:
// the starters, topics and question box are shown but not interactive, and
// the page says they are coming (no broken buttons, D24).
export function LearnView() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="px-6 pt-8">
          <h1 className="font-heading text-h3 font-medium text-navy">Learn</h1>
        </header>
        <main className="stagger flex flex-1 flex-col gap-5 px-6 pt-6 pb-6">
          <section aria-labelledby="penny" className="flex flex-col gap-3 rounded-card bg-violet p-5 text-white">
            <div className="flex items-center gap-3">
              <span className="flex size-[67px] shrink-0 items-center justify-center overflow-hidden rounded-pill bg-off-white">
                <Image src="/mascot/penny-avatar.png" alt="" width={67} height={67} />
              </span>
              <div className="flex flex-col">
                <h2 id="penny" className="font-heading text-h6 font-medium">
                  Hi! I’m Penny.
                </h2>
                <p className="text-body-s">Got a money question? I’ll point you to the right resource.</p>
              </div>
            </div>
            <ul aria-label="Questions to start with" className="flex flex-col items-start gap-[5px]">
              {PENNY_STARTERS.map((question) => (
                <li key={question} className="rounded-input bg-navy/50 px-3 py-[5px] text-caption">
                  {question}
                </li>
              ))}
            </ul>
            <div
              aria-disabled="true"
              className="flex min-h-[58px] items-center justify-between rounded-pill bg-white py-3 pr-3 pl-4 text-body-m text-indigo-black/70"
            >
              Ask Penny anything...
              <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-pill bg-light-blue text-white">
                <ArrowRight width={20} height={20} />
              </span>
            </div>
            <p className="text-caption text-white/85">Ask Penny opens soon.</p>
          </section>

          <section aria-labelledby="credit-basics" className="flex flex-col gap-3 rounded-card border-[1.5px] border-off-white bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="credit-basics" className="font-heading text-h6 font-medium text-navy">
                Credit basics
              </h2>
              <p className="text-body-s text-indigo-black/70">
                0 of {CREDIT_BASICS_LESSONS} done
              </p>
            </div>
            <ProgressBar current={0} total={CREDIT_BASICS_LESSONS} />
            <p className="text-body-s text-navy">
              Up next:
              <br />
              What preapproval is
            </p>
            <p className="text-caption text-indigo-black/70">Lessons are on the way.</p>
          </section>

          <section aria-labelledby="topics" className="flex flex-col gap-[21px]">
            <h2 id="topics" className="font-heading text-h6 font-medium text-navy">
              Browse by topic
            </h2>
            <ul className="grid grid-cols-2 gap-x-[46px] gap-y-3">
              {TOPICS.map((topic) => (
                <li key={topic} className="rounded-[10px] bg-off-white px-2.5 py-[5px] text-caption font-medium text-navy">
                  {topic}
                </li>
              ))}
            </ul>
          </section>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
