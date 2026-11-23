import type { CSSProperties } from "react";

import styles from "./welcome.module.css";

// Created with Claude Code (2026-11-19). The night sky behind the first
// sign-in welcome: eight Design System Stars (371:2914) per frame, W1
// (821:8430 to 8437) and W2 (821:8475 to 8482), each the frame's own exported
// SVG with its glow (Lit Amber, Next Light Blue, Empty Off-white at 70%).
// Positions are each star's centre in the 390 by 844 frame, kept as
// percentages so the sky keeps its shape on any phone.
//
// On W1 the stars light one by one. On W2 each star moves to its W2 place and
// changes to its W2 state, as Smart Animate pairs them in the prototype, so
// the sky fills in as Penny says what comes next. CSS only; with reduced
// motion every star simply sits in place.

export type WelcomeStage = "hello" | "go";

type StarKind = "lit20" | "lit12" | "next12" | "empty12" | "empty20";

const KINDS: Record<StarKind, { src: string; width: number; height: number }> = {
  lit20: { src: "/decor/star-lit-20.svg", width: 44, height: 43.1767 },
  lit12: { src: "/decor/star-lit-12.svg", width: 28, height: 27.506 },
  next12: { src: "/decor/star-next-12.svg", width: 20, height: 19.506 },
  empty12: { src: "/decor/star-empty-12.svg", width: 20, height: 19.506 },
  empty20: { src: "/decor/star-empty-20.svg", width: 32, height: 31.1767 },
};

type StarPlace = { x: number; y: number; rotate: number; kind: StarKind };

// [W1, W2] for each star, in the frames' layer order.
export const STARS: { hello: StarPlace; go: StarPlace }[] = [
  { hello: { x: 50, y: 100, rotate: 18, kind: "lit20" }, go: { x: 50, y: 100, rotate: 4, kind: "lit20" } },
  { hello: { x: 326, y: 136, rotate: -12, kind: "next12" }, go: { x: 326, y: 136, rotate: -28, kind: "lit12" } },
  { hello: { x: 70, y: 306, rotate: 7, kind: "empty12" }, go: { x: 70, y: 306, rotate: 21, kind: "next12" } },
  { hello: { x: 344, y: 386, rotate: -24, kind: "lit12" }, go: { x: 344, y: 386, rotate: -15, kind: "lit12" } },
  { hello: { x: 34, y: 722, rotate: 26, kind: "lit12" }, go: { x: 36, y: 616, rotate: 18, kind: "lit12" } },
  { hello: { x: 310, y: 710, rotate: -8, kind: "empty20" }, go: { x: 310, y: 710, rotate: -12, kind: "lit20" } },
  { hello: { x: 186, y: 766, rotate: 14, kind: "lit12" }, go: { x: 186, y: 66, rotate: 7, kind: "lit12" } },
  { hello: { x: 362, y: 476, rotate: -19, kind: "next12" }, go: { x: 356, y: 566, rotate: -24, kind: "empty12" } },
];

export function StarField({ stage }: { stage: WelcomeStage }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {STARS.map((star, index) => {
        const place = star[stage];
        const kinds = [...new Set([star.hello.kind, star.go.kind])];
        return (
          <span
            key={index}
            data-star={place.kind}
            className={styles.starSlot}
            style={{
              left: `${(place.x / 390) * 100}%`,
              top: `${(place.y / 844) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${place.rotate}deg)`,
            }}
          >
            {/* Lit one by one on W1: 150ms in, then every 110ms. */}
            <span className={styles.starLight} style={{ "--star-delay": `${150 + index * 110}ms` } as CSSProperties}>
              {kinds.map((kind) => (
                // eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG, drawn at its own size
                <img
                  key={kind}
                  src={KINDS[kind].src}
                  alt=""
                  width={KINDS[kind].width}
                  height={KINDS[kind].height}
                  className={styles.starKind}
                  style={{ opacity: kind === place.kind ? 1 : 0 }}
                />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}
