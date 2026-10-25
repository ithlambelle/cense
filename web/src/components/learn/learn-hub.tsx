import Calculator from "@gravity-ui/icons/Calculator";
import ChevronRight from "@gravity-ui/icons/ChevronRight";
import CreditCard from "@gravity-ui/icons/CreditCard";
import GraduationCap from "@gravity-ui/icons/GraduationCap";
import Sack from "@gravity-ui/icons/Sack";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import { PennyComposer } from "@/components/learn/penny-composer";
import { BottomNav } from "@/components/ui/bottom-nav";
import { choiceRowClass } from "@/components/ui/choice-row";
import { findAnswer, PENNY_TOPICS, STARTER_IDS, type PennyTopic } from "@/lib/penny/answers";
import { PENNY_COPY } from "@/lib/penny/copy";
import { learnTopicPath, pennyPath } from "@/lib/routes";

// Each topic's Gravity icon, from the hub frame (144:3093).
const TOPIC_ICONS: Record<PennyTopic, ComponentType<SVGProps<SVGSVGElement>>> = {
  credit: CreditCard,
  budgeting: Calculator,
  saving: Sack,
  "student-loans": GraduationCap,
};

// Learn (Flow 5 step 1, 144:3059; C18): Penny's card with the two starter
// questions and a field to type one, then the four topics. Everything here
// that looks tappable leads somewhere real. The frame's "Credit basics"
// progress card waits for lessons (C22), which are not built yet.
export function LearnHub() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="box-content flex h-12 items-center px-6 pt-8">
          <h1 className="font-heading text-h3 font-medium text-navy">Learn</h1>
        </header>
        <main className="stagger flex flex-1 flex-col gap-5 p-6">
          <section aria-labelledby="penny-card" className="flex flex-col gap-3 rounded-card bg-violet p-5">
            <div className="flex items-start gap-3">
              {/* Penny in an Off-white circle, cropped as in the frame. */}
              <div className="relative size-[67px] shrink-0 overflow-hidden rounded-pill bg-off-white">
                <Image
                  src="/mascot/penny.png"
                  alt=""
                  width={67}
                  height={67}
                  priority
                  className="absolute top-[7px] -left-[3px] size-[67px] max-w-none"
                />
              </div>
              <div className="flex flex-col text-white">
                <h2 id="penny-card" className="font-heading text-[16px] leading-[23px] font-medium">
                  {PENNY_COPY.greetingTitle}
                </h2>
                <p className="text-body-s">{PENNY_COPY.greeting}</p>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {STARTER_IDS.map((id) => {
                const starter = findAnswer(id);
                if (!starter) return null;
                return (
                  <li key={id}>
                    <Link href={pennyPath(id, "learn")} className={choiceRowClass}>
                      {starter.question}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <PennyComposer variant="learn" />
          </section>

          <section aria-labelledby="browse-topics" className="flex flex-col gap-5">
            <h2 id="browse-topics" className="font-heading text-[16px] leading-[23px] font-medium text-navy">
              Browse by topic
            </h2>
            <ul className="grid grid-cols-2 gap-3">
              {PENNY_TOPICS.map((topic) => {
                const Icon = TOPIC_ICONS[topic.slug];
                return (
                  <li key={topic.slug}>
                    {/* Lavender in place of the frame's light blue (G3: light blue is not a palette color). */}
                    <Link
                      href={learnTopicPath(topic.slug)}
                      className="flex min-h-14 items-center gap-2.5 rounded-[20px] bg-off-white py-2 pr-3 pl-3.5 text-body-s font-medium text-navy outline-none transition-colors hover:bg-selected-outline/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[0.98]"
                    >
                      <Icon aria-hidden="true" width={20} height={20} className="shrink-0 text-violet" />
                      <span className="flex-1 leading-[18px]">{topic.label}</span>
                      <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-violet" />
                    </Link>
                  </li>
                );
              })}
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
