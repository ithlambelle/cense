"use client";

import ArrowRight from "@gravity-ui/icons/ArrowRight";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MAX_QUESTION_LENGTH } from "@/lib/api/penny";
import { PENNY_COPY } from "@/lib/penny/copy";
import { handOffQuestion } from "@/lib/penny/pending-question";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Props = {
  // "learn": the white field on Penny's card (144:3076), which opens Ask
  // Penny with the question. "chat": Ask Penny's own field (144:3186).
  variant: "learn" | "chat";
  // Chat only: sends the question. Learn hands it to Ask Penny instead.
  onAsk?: (question: string) => void;
  // Chat only: true while Penny is answering, so one question goes at a time.
  busy?: boolean;
};

// The one way to type a question to Penny. Send stays off until there is
// something to send.
export function PennyComposer({ variant, onAsk, busy = false }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const trimmed = question.trim();
  const canSend = trimmed.length > 0 && !busy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    if (variant === "learn") {
      handOffQuestion(trimmed);
      router.push(ROUTES.penny);
      return;
    }
    onAsk?.(trimmed);
    setQuestion("");
  }

  const learn = variant === "learn";
  return (
    <form
      aria-label="Ask Penny"
      onSubmit={submit}
      className={cn(
        "flex items-center",
        // On the violet card the focus ring goes round the whole white field.
        learn
          ? "min-h-14 rounded-pill bg-white pr-1.5 pl-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-white"
          : "gap-2.5",
      )}
    >
      <input
        type="text"
        aria-label="Ask Penny"
        placeholder={PENNY_COPY.placeholder}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={MAX_QUESTION_LENGTH}
        autoComplete="off"
        enterKeyHint="send"
        className={cn(
          "min-w-0 flex-1 text-navy",
          // outline-none would also cancel a focus-visible ring (Tailwind 4
          // sets the ring's style from the same variable), so only the Learn
          // field, whose ring is drawn on the form, turns its own outline off.
          learn
            ? "h-11 bg-transparent text-body-m outline-none placeholder:text-indigo-black/70"
            : "h-12 rounded-input bg-off-white px-4 text-body-s placeholder:text-indigo-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={!canSend}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40",
          learn ? "" : "size-12 bg-violet text-white enabled:hover:bg-violet-hover enabled:active:bg-violet-pressed",
        )}
      >
        {learn ? (
          <Image src="/icons/penny-go.svg" alt="" width={34} height={34} />
        ) : (
          <ArrowRight aria-hidden="true" width={20} height={20} />
        )}
      </button>
    </form>
  );
}
