"use client";

import { useState } from "react";

// "Copy script" on Consider contacting the issuer (Figma 144:2426, C12):
// copies the numbered steps so the student can keep them open during the call.
export function CopyScript({ steps }: { steps: string[] }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={copy}
        className="min-h-6 text-body-s font-semibold text-violet underline underline-offset-2 outline-none hover:text-violet-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Copy script
      </button>
      <p role="status" className="text-body-s text-indigo-black empty:hidden">
        {state === "copied" ? "Copied." : state === "failed" ? "Couldn’t copy. The steps are above." : ""}
      </p>
    </div>
  );
}
