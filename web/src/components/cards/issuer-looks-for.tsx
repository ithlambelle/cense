"use client";

import { useId, useState } from "react";

// "What the issuer looks for" on the card page (Figma 144:2936): a white box
// with a 1.5px off-white border, radius 22, 20/16 padding, Sora 16 heading and
// Inter 14/20 text. The frame shows one short line. Students said the full
// list read as too long (James, Oct 26), so the first rule shows and the rest
// open from a text button. Nothing is cut: every rule is one press away.
export function IssuerLooksFor({ rules }: { rules: { kind: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const headingId = useId();
  if (rules.length === 0) return null;
  const shown = open ? rules : rules.slice(0, 1);
  const hidden = rules.length - shown.length;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-off-white bg-white px-5 py-4"
    >
      <h2 id={headingId} className="font-heading text-h6 font-medium text-navy">
        What the issuer looks for
      </h2>
      <ul id={listId} className="flex flex-col gap-2">
        {shown.map((rule) => (
          <li key={rule.kind} className="text-body-s text-indigo-black">
            {rule.text}
          </li>
        ))}
      </ul>
      {rules.length > 1 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="-mb-2 min-h-11 cursor-pointer self-start text-body-s font-semibold text-violet underline-offset-2 hover:text-violet-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      ) : null}
    </section>
  );
}
