"use client";

import Link from "next/link";

import { ResultCard } from "@/components/results/result-card";
import { FailedScreen, LoadingScreen } from "@/components/shell/status-screens";
import { BottomNav } from "@/components/ui/bottom-nav";
import { buttonVariants } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/note";
import { ScreenShell } from "@/components/ui/screen-shell";
import { apiRequest, failureMessage, isUnauthorized, type ApiData } from "@/lib/api-client/client";
import { GUIDANCE_LINE, RESULT_HEADLINES } from "@/lib/copy/results";
import { firstUnanswered } from "@/lib/quiz/questions";
import { ROUTES, signInPath } from "@/lib/routes";
import { useLoaded, type LoadOutcome } from "@/lib/use-loaded";

type Result =
  // No saved match. `quizDone` is true when all six answers are saved, which
  // means the match has not been worked out yet (the server does that).
  | { kind: "none"; quizDone: boolean }
  | {
      kind: "match";
      recommendation: ApiData<"/recommendations/latest", "get">;
      // Null when the card's details cannot be read right now.
      card: ApiData<"/cards/{id}", "get"> | null;
    };

async function loadResult(): Promise<LoadOutcome<Result>> {
  const result = await apiRequest("get", "/recommendations/latest");
  if (result.ok) {
    // The match still shows if the card's details cannot be read (for example
    // while the catalog is empty), so a card failure is not a screen failure.
    const card = await apiRequest("get", "/cards/{id}", { pathParams: { id: result.data.cardId } });
    return { status: "ready", data: { kind: "match", recommendation: result.data, card: card.ok ? card.data : null } };
  }
  if (isUnauthorized(result)) return "signed-out";
  if (result.kind === "api" && result.status === 404) {
    const quiz = await apiRequest("get", "/quiz");
    if (quiz.ok) {
      return { status: "ready", data: { kind: "none", quizDone: firstUnanswered(quiz.data.answers) === null } };
    }
    if (isUnauthorized(quiz)) return "signed-out";
    // 404 means no saved quiz. Anything else is a failure, not "no quiz".
    if (quiz.kind === "api" && quiz.status === 404) return { status: "ready", data: { kind: "none", quizDone: false } };
    return { status: "failed", message: failureMessage(quiz) };
  }
  return { status: "failed", message: failureMessage(result) };
}

const RESULTS_SIGN_IN = signInPath(ROUTES.results);

export function ResultsFlow() {
  const { loaded, retry } = useLoaded(loadResult, RESULTS_SIGN_IN);
  const nav = <BottomNav />;

  if (loaded.status === "loading") return <LoadingScreen label="Loading your card match" nav={nav} />;
  if (loaded.status === "failed") {
    return <FailedScreen title="We couldn’t load your card match" message={loaded.message} onRetry={retry} nav={nav} />;
  }

  const result = loaded.data;

  if (result.kind === "none" && result.quizDone) {
    return (
      <ScreenShell
        nav={nav}
        footer={
          <Link href={ROUTES.quiz} className={buttonVariants({ variant: "secondary" })}>
            Review my answers
          </Link>
        }
      >
        <h1 className="font-heading text-title font-bold">Your answers are saved</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Your card match isn’t ready yet. It will show here when it is. You won’t need to answer the questions again.
        </p>
      </ScreenShell>
    );
  }

  if (result.kind === "none") {
    return (
      <ScreenShell nav={nav} footer={<Link href={ROUTES.quiz} className={buttonVariants()}>Take the quiz</Link>}>
        <h1 className="font-heading text-title font-bold">No card match yet</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Answer six short questions and we’ll show a card to start with, and the reason for it.
        </p>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      nav={nav}
      footer={
        <Link href={ROUTES.quiz} className={buttonVariants({ variant: "secondary" })}>
          Retake quiz
        </Link>
      }
    >
      <h1 className="font-heading text-title font-bold">{RESULT_HEADLINES[result.recommendation.fitTier]}</h1>
      <div className="mt-6">
        <ResultCard recommendation={result.recommendation} card={result.card} />
      </div>
      <Disclaimer className="mt-6">{GUIDANCE_LINE}</Disclaimer>
    </ScreenShell>
  );
}
