import Link from "next/link";

import { AppHeader } from "@/components/ui/app-header";
import { BottomNav } from "@/components/ui/bottom-nav";
import { choiceRowClass } from "@/components/ui/choice-row";
import { topicAnswers, type PennyTopic } from "@/lib/penny/answers";
import { pennyPath, ROUTES } from "@/lib/routes";

// A topic page (Flow 5 A1, 144:3285; C21): Penny's checked answers for one
// topic as quiz answer rows. Tapping one opens it in Ask Penny.
export function TopicView({ topic }: { topic: { slug: PennyTopic; label: string } }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <AppHeader backHref={ROUTES.learn} backLabel="Learn" />
        <main className="stagger flex flex-1 flex-col gap-4 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-h2 font-medium text-navy">{topic.label}</h1>
            <p className="text-body-m text-indigo-black">Short answers from Penny, each checked against an official source.</p>
          </div>
          <ul className="flex flex-col gap-4">
            {topicAnswers(topic.slug).map((answer) => (
              <li key={answer.id}>
                <Link href={pennyPath(answer.id, topic.slug)} className={choiceRowClass}>
                  {answer.question}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-body-s text-indigo-black">Educational, not financial advice.</p>
        </main>
        <div className="sticky bottom-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
