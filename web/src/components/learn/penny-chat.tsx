"use client";

import ChevronRight from "@gravity-ui/icons/ChevronRight";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import { PennyComposer } from "@/components/learn/penny-composer";
import { BackLink } from "@/components/ui/app-header";
import { Button, ButtonChevron, buttonVariants } from "@/components/ui/button";
import { choiceRowClass } from "@/components/ui/choice-row";
import { NO_CAPTURE, SENSITIVE, track } from "@/lib/analytics";
import type { PennyReply } from "@/lib/api/penny";
import { apiRequest, isUnauthorized, OFFLINE_MESSAGE, type ApiFailure } from "@/lib/api-client/client";
import {
  findAnswer,
  findTopic,
  PENNY_ANSWER_IDS,
  PENNY_TOPICS,
  STARTER_IDS,
  TOPIC_QUESTIONS,
  type PennyAnswer,
  type PennyTopic,
} from "@/lib/penny/answers";
import { PENNY_COPY } from "@/lib/penny/copy";
import { isCrisis } from "@/lib/penny/crisis";
import { peekHandedOffQuestion, takeHandedOffQuestion } from "@/lib/penny/pending-question";
import { learnTopicPath, ROUTES, signInPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

type QuestionRef = { id: string; question: string };
type AnswerRef = { id: string; topic: string; source: { name: string; url: string } };

type Message =
  | { id: number; from: "student"; text: string }
  | { id: number; from: "penny"; kind: "answer"; text: string; answer: AnswerRef }
  | {
      id: number;
      from: "penny";
      kind: "note";
      text: string;
      suggestions: QuestionRef[];
      action?: { kind: "retry"; question: string } | { kind: "sign-in" };
    }
  // The 988 line, with a call and a text one tap away.
  | { id: number; from: "penny"; kind: "crisis"; text: string };

type Source = "starter" | "topic" | "suggestion" | "typed" | "link";
type Outcome = "answered" | "advice" | "off_topic" | "unknown" | "limit" | "unavailable" | "offline" | "signed_out";

// A model answer can take a while; past this, Penny says she is still on it.
const SLOW_AFTER_MS = 8_000;
// Longer than the server's worst case (a 15 second call, retried once).
const PENNY_TIMEOUT_MS = 40_000;

const STARTERS: QuestionRef[] = STARTER_IDS.map((id) => findAnswer(id)).filter((a) => a !== undefined).map(ref);

function ref(answer: PennyAnswer): QuestionRef {
  return { id: answer.id, question: answer.question };
}

// Where fresh questions come from: the starters, then each topic's list.
const FRESH_ORDER: string[] = [...new Set<string>([...STARTER_IDS, ...PENNY_TOPICS.flatMap((topic) => TOPIC_QUESTIONS[topic.slug]), ...PENNY_ANSWER_IDS])];

// A reply never offers a question already offered or answered above (it is
// still on screen): repeats are replaced with checked answers not shown yet.
// Only if every one has been shown do repeats stay.
function withFreshSuggestions(message: Message, earlier: Message[]): Message {
  if (message.from !== "penny" || message.kind !== "note" || message.suggestions.length === 0) return message;
  const shown = new Set<string>();
  for (const before of earlier) {
    if (before.from !== "penny") continue;
    if (before.kind === "answer") shown.add(before.answer.id);
    if (before.kind === "note") for (const suggestion of before.suggestions) shown.add(suggestion.id);
  }
  const fresh = [...new Set([...message.suggestions.map((suggestion) => suggestion.id), ...FRESH_ORDER])]
    .filter((id) => !shown.has(id))
    .slice(0, message.suggestions.length)
    .map((id) => findAnswer(id))
    .filter((answer) => answer !== undefined)
    .map(ref);
  return fresh.length > 0 ? { ...message, suggestions: fresh } : message;
}

let nextId = 0;
const newId = () => ++nextId;

function checkedAnswerMessages(answer: PennyAnswer): Message[] {
  return [
    { id: newId(), from: "student", text: answer.question },
    { id: newId(), from: "penny", kind: "answer", text: answer.answer, answer },
  ];
}

function greeting(canType: boolean): Message {
  return {
    id: newId(),
    from: "penny",
    kind: "note",
    text: `${PENNY_COPY.greetingTitle} ${canType ? PENNY_COPY.greeting : PENNY_COPY.greetingTapOnly}`,
    suggestions: STARTERS,
  };
}

function crisisMessage(): Message {
  return { id: newId(), from: "penny", kind: "crisis", text: PENNY_COPY.crisis };
}

function replyMessage(reply: PennyReply): Message {
  if (reply.kind === "declined" && reply.reason === "crisis") return crisisMessage();
  if (reply.kind === "answer") return { id: newId(), from: "penny", kind: "answer", text: reply.text, answer: reply.answer };
  return { id: newId(), from: "penny", kind: "note", text: reply.text, suggestions: reply.suggestions };
}

function failureMessage(failure: ApiFailure, question: string): { message: Message; outcome: Outcome } {
  if (isUnauthorized(failure)) {
    return { message: { id: newId(), from: "penny", kind: "note", text: PENNY_COPY.signedOut, suggestions: [], action: { kind: "sign-in" } }, outcome: "signed_out" };
  }
  if (failure.kind === "api" && failure.code === "penny_limit") {
    return { message: { id: newId(), from: "penny", kind: "note", text: PENNY_COPY.limit, suggestions: STARTERS }, outcome: "limit" };
  }
  if (failure.kind === "network") {
    return {
      message: { id: newId(), from: "penny", kind: "note", text: OFFLINE_MESSAGE, suggestions: [], action: { kind: "retry", question } },
      outcome: "offline",
    };
  }
  return {
    message: {
      id: newId(),
      from: "penny",
      kind: "note",
      text: PENNY_COPY.unavailable,
      suggestions: STARTERS,
      action: { kind: "retry", question },
    },
    outcome: "unavailable",
  };
}

// Null for a crisis, which is never sent anywhere.
function outcomeOf(reply: PennyReply): Outcome | null {
  if (reply.kind === "answer") return "answered";
  return reply.reason === "crisis" ? null : reply.reason;
}

function sendEvent(source: Source, outcome: Outcome, answerId?: string) {
  // Only a catalog answer id, the same for every student, goes with the event.
  const answer_id = PENNY_ANSWER_IDS.find((id) => id === answerId);
  track("penny_question_asked", answer_id ? { source, outcome, answer_id } : { source, outcome });
}

type Props = {
  // A checked answer to open with (?answer=), already looked up by the page.
  initialAnswerId: string | null;
  // Where the chat was opened: "learn" or a topic's slug (?from=).
  from: string | null;
  back: { href: string; label: string };
  // Whether the server can answer typed questions (ANTHROPIC_API_KEY is
  // set). Without it there is no field: it could only say "unavailable".
  canType: boolean;
};

// Ask Penny (Flow 5 steps 2 and 3, 144:3149 and 144:3221; C19, C20). A tapped
// question shows its checked answer at once, with no model call. A typed one
// goes to POST /penny. Nothing is kept: leaving the screen ends the
// conversation (S34, no memory).
export function PennyChat({ initialAnswerId, from, back, canType }: Props) {
  // A question typed on Learn arrives with its bubble and the typing dots
  // already showing; it is sent once the screen is up.
  const [messages, setMessages] = useState<Message[]>(() => {
    const answer = initialAnswerId ? findAnswer(initialAnswerId) : undefined;
    if (answer) return checkedAnswerMessages(answer);
    const handedOff = peekHandedOffQuestion();
    return handedOff ? [{ id: newId(), from: "student", text: handedOff }] : [greeting(canType)];
  });
  const [pending, setPending] = useState(() => !initialAnswerId && peekHandedOffQuestion() !== null);
  const [slow, setSlow] = useState(false);
  const lastRef = useRef<HTMLElement | null>(null);
  const started = useRef(false);

  // Sends a question whose bubble is already on screen, and adds Penny's reply.
  async function send(question: string) {
    // A crisis is answered here, before anything is sent, so the 988 line
    // shows offline, signed out, at the limit or with Penny unavailable.
    if (isCrisis(question)) {
      setPending(false);
      setSlow(false);
      setMessages((current) => [...current, crisisMessage()]);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const result = await apiRequest("post", "/penny", { body: { question }, timeoutMs: PENNY_TIMEOUT_MS });
    clearTimeout(timer);
    setPending(false);
    setSlow(false);
    if (result.ok) {
      const reply = replyMessage(result.data);
      setMessages((current) => [...current, withFreshSuggestions(reply, current)]);
      const outcome = outcomeOf(result.data);
      if (outcome) sendEvent("typed", outcome, result.data.kind === "answer" ? result.data.answer.id : undefined);
      return;
    }
    const { message, outcome } = failureMessage(result, question);
    setMessages((current) => [...current, withFreshSuggestions(message, current)]);
    sendEvent("typed", outcome);
  }

  // A typed question, or Try again (which replaces its failure note).
  function ask(question: string, retry?: number) {
    setMessages((current) => [
      ...current.filter((message) => message.id !== retry),
      ...(retry === undefined ? [{ id: newId(), from: "student" as const, text: question }] : []),
    ]);
    setPending(true);
    setSlow(false);
    void send(question);
  }

  function showChecked(question: QuestionRef) {
    const answer = findAnswer(question.id);
    if (!answer) return;
    setMessages((current) => [...current, ...checkedAnswerMessages(answer)]);
    sendEvent("suggestion", "answered", answer.id);
  }

  // On arrival: count the opening answer, or send the question typed on Learn.
  const arrive = useEffectEvent(() => {
    if (initialAnswerId && findAnswer(initialAnswerId)) {
      const source: Source = from === "learn" ? "starter" : from && findTopic(from) ? "topic" : "link";
      sendEvent(source, "answered", initialAnswerId);
      return;
    }
    const question = takeHandedOffQuestion();
    if (question) void send(question);
  });
  useEffect(() => {
    // Once per visit, also under Strict Mode's double effect in development.
    if (started.current) return;
    started.current = true;
    arrive();
  }, []);

  // Each new message, the typing dots, and "Still thinking" under them
  // scroll into view above the field.
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [lastId, pending, slow]);

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-phone flex-col">
        <header className="flex flex-col gap-4 px-6 pt-8">
          <div className="flex items-center">
            <BackLink href={back.href} label={back.label} />
            <div className="flex flex-1 items-center gap-[5px]">
              {/* Home's avatar of the astro pig (#42), shown at once with the header. */}
              <Image
                src="/mascot/astro-pig/avatar.png"
                alt=""
                width={40}
                height={40}
                priority
                className="size-10 shrink-0 rounded-pill bg-off-white"
              />
              <h1 className="font-heading text-h5 font-medium text-navy">Penny</h1>
            </div>
          </div>
          <p className="text-center text-caption text-indigo-black/70">
            {canType ? PENNY_COPY.disclaimer : PENNY_COPY.disclaimerTapOnly}
          </p>
        </header>

        <main className="flex flex-1 flex-col px-6 pt-4 pb-4">
          {/* Blocked from session replay as a whole (an empty box), and kept
              out of autocapture: what a student asks, and whether they
              reached the 988 line, leave no trace. Students are identified. */}
          <div role="log" aria-label="Conversation with Penny" className={cn(NO_CAPTURE, "flex flex-col gap-4")}>
            {messages.map((message, index) => (
              <MessageView
                key={message.id}
                message={message}
                from={from}
                latest={index === messages.length - 1}
                lastRef={index === messages.length - 1 && !pending ? lastRef : undefined}
                onPick={showChecked}
                onRetry={(question) => ask(question, message.id)}
                busy={pending}
              />
            ))}
          </div>
          {pending ? (
            <div
              ref={(element) => {
                lastRef.current = element;
              }}
              role="status"
              className="mt-4 flex scroll-mb-28 flex-col items-start gap-1.5"
            >
              <span className="flex h-10 items-center gap-1.5 rounded-[20px] bg-off-white px-4" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-2 rounded-full bg-indigo-black/50 motion-safe:animate-pulse"
                    style={{ animationDelay: `${dot * 160}ms` }}
                  />
                ))}
              </span>
              <span className="sr-only">{PENNY_COPY.thinking}</span>
              {slow ? <span className="text-caption text-indigo-black/70">{PENNY_COPY.stillThinking}</span> : null}
            </div>
          ) : null}
        </main>

        {canType ? (
          <footer className="sticky bottom-0 bg-white px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <PennyComposer variant="chat" busy={pending} onAsk={(question) => ask(question)} />
          </footer>
        ) : null}
      </div>
    </div>
  );
}

type MessageViewProps = {
  message: Message;
  // Only the newest message offers Try again or Sign in again.
  latest: boolean;
  from: string | null;
  lastRef?: RefObject<HTMLElement | null>;
  onPick: (question: QuestionRef) => void;
  onRetry: (question: string) => void;
  busy: boolean;
};

function MessageView({ message, from, latest, lastRef, onPick, onRetry, busy }: MessageViewProps) {
  if (message.from === "student") {
    return (
      <article ref={lastRef} aria-label="You" className="flex scroll-mb-28 justify-end">
        {/* Masked in session replay: a typed question shows here before any
            personal detail is removed. */}
        <p className={cn(SENSITIVE, "max-w-[252px] rounded-[20px] bg-violet px-4 py-2.5 text-body-s break-words text-white")}>
          {message.text}
        </p>
      </article>
    );
  }

  return (
    <article ref={lastRef} aria-label="Penny" className="flex scroll-mb-28 flex-col items-start gap-4">
      {/* Lavender in place of the frame's light blue bubble (G3). */}
      <div className="flex max-w-[302px] flex-col gap-1.5 rounded-[20px] bg-off-white px-4 py-2.5">
        {/* Masked too: a typed answer can restate the question. */}
        <p className={cn(SENSITIVE, "text-body-s text-navy")}>{message.text}</p>
        {message.kind === "answer" ? (
          <a
            href={message.answer.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3 flex min-h-11 items-center self-start text-caption text-indigo-black/65 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Source: {message.answer.source.name}
          </a>
        ) : null}
      </div>

      {message.kind === "answer" && message.answer.topic !== from ? <TopicCard topic={message.answer.topic} /> : null}

      {/* The app's primary then secondary pair (as on Second look). */}
      {message.kind === "crisis" ? (
        <div className="flex w-full flex-col gap-2">
          <a href="tel:988" className={buttonVariants()}>
            Call 988
            <ButtonChevron />
          </a>
          <a href="sms:988" className={buttonVariants({ variant: "secondary" })}>
            Text 988
          </a>
        </div>
      ) : null}

      {message.kind === "note" && message.suggestions.length > 0 ? (
        <ul className="flex w-full flex-col gap-3">
          {message.suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" onClick={() => onPick(suggestion)} className={cn(choiceRowClass, "text-left")}>
                {suggestion.question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {latest && message.kind === "note" && message.action?.kind === "retry" ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (message.action?.kind === "retry") onRetry(message.action.question);
          }}
        >
          Try again
        </Button>
      ) : null}
      {latest && message.kind === "note" && message.action?.kind === "sign-in" ? (
        <Link href={signInPath(ROUTES.penny)} className={buttonVariants({ variant: "secondary" })}>
          Sign in again
        </Link>
      ) : null}
    </article>
  );
}

// The link into Learn under an answer (C19, after the frame's "Learn more
// card" 144:3165). It opens the answer's topic until lessons exist (C22).
function TopicCard({ topic }: { topic: string }) {
  const found = findTopic(topic);
  if (!found) return null;
  const count = TOPIC_QUESTIONS[found.slug as PennyTopic].length;
  return (
    <Link
      href={learnTopicPath(found.slug)}
      className="flex w-full flex-col gap-1 rounded-card border-[1.5px] border-violet bg-white px-5 py-4 transition-colors hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="text-caption text-indigo-black/65">TOPIC · {count} ANSWERS</span>
      <span className="flex items-center gap-2">
        <span className="flex-1 font-heading text-[16px] leading-[22px] font-medium text-navy">
          More about {found.label.toLowerCase()}
        </span>
        <ChevronRight aria-hidden="true" width={16} height={16} className="shrink-0 text-violet" />
      </span>
    </Link>
  );
}
