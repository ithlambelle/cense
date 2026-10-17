"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FALLBACK_MESSAGE } from "@/lib/api-client/client";
import { reportError } from "@/lib/report-error";

export type Loaded<Data> =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; data: Data };

export type LoadOutcome<Data> = { status: "failed"; message: string } | { status: "ready"; data: Data } | "signed-out";

// Runs a load when the screen opens. A signed-out answer sends the student to
// sign-in with a way back; every other outcome is handed to the screen.
// `load` must be defined outside the component so it keeps one identity.
export function useLoaded<Data>(
  load: () => Promise<LoadOutcome<Data>>,
  signInHref: string,
): { loaded: Loaded<Data>; retry: () => void } {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded<Data>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load()
      // A load that throws is a mistake in this app. It must still end in a
      // screen with a retry, never an endless "Loading".
      .catch((error: unknown): LoadOutcome<Data> => {
        reportError("useLoaded", error);
        return { status: "failed", message: FALLBACK_MESSAGE };
      })
      .then((outcome) => {
        if (!current) return;
        if (outcome === "signed-out") {
          router.replace(signInHref);
          return;
        }
        setLoaded(outcome);
      });
    return () => {
      current = false;
    };
  }, [load, signInHref, router, attempt]);

  return {
    loaded,
    retry: () => {
      setLoaded({ status: "loading" });
      setAttempt(attempt + 1);
    },
  };
}
