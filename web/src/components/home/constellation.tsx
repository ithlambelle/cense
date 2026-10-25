import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

// The burst star (public/decor/burst-star.svg, the frames' star shape) as a
// mask, so one file draws every color.
export const STAR = "mask-[url(/decor/burst-star.svg)] mask-contain mask-center mask-no-repeat";

// Positions as a share of the 299-wide panel, so the stars keep their places
// at any card width.
const PANEL_WIDTH = 299;
const at = (x: number, y: number): CSSProperties => ({ left: `${(x / PANEL_WIDTH) * 100}%`, top: y });

// Each layout: star centers in the 299 by 92 panel and star sizes by state,
// from the Constellation component (Figma 272:2327).
const LAYOUTS = {
  // First month, three stars (212:1777).
  three: {
    stars: [
      [40, 60],
      [154.5, 34],
      [269, 52],
    ],
    size: { lit: 22, next: 19, empty: 10 },
  },
  // Denial plan, five stars (Stars=5, Progress=2 in 144:2248).
  five: {
    stars: [
      [40, 62],
      [97.25, 40],
      [154.5, 58],
      [211.75, 34],
      [269, 50],
    ],
    size: { lit: 20, next: 20, empty: 12 },
  },
} as const;

const SKY_DOTS = [
  [18, 72],
  [120, 16],
  [200, 80],
  [276, 22],
  [60, 40],
  [236, 58],
] as const;

// Progress as a constellation: lit stars are amber with a warm glow, the next
// one is white with a halo, the rest wait dim. A line turns solid amber once
// both its stars are lit (144:1733). The frames' light blue (lines, halo,
// count) is lavender here.
export function Constellation({ count, layout }: { count: number; layout: keyof typeof LAYOUTS }) {
  const { stars, size } = LAYOUTS[layout];
  return (
    <div className="relative h-[92px] overflow-hidden rounded-[16px] bg-navy">
      <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 299 92" preserveAspectRatio="none">
        {stars.slice(1).map(([x, y], index) => {
          const [fromX, fromY] = stars[index];
          const solid = index + 1 < count;
          return (
            <line
              key={x}
              x1={fromX}
              y1={fromY}
              x2={x}
              y2={y}
              className={solid ? "stroke-amber" : "stroke-off-white"}
              strokeOpacity={solid ? 1 : 0.35}
              strokeWidth={solid ? 2 : 1.25}
              strokeDasharray={solid ? undefined : "2.9 4.9"}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {SKY_DOTS.map(([x, y]) => (
        <span key={`${x}-${y}`} aria-hidden="true" className="absolute size-[2.5px] rounded-pill bg-white/35" style={at(x, y)} />
      ))}
      {stars.map(([x, y], index) => {
        if (index < count) {
          return (
            <span key={x} aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_6px_rgb(253_192_61/0.9)]" style={at(x, y)}>
              <span className={cn(STAR, "block animate-pop bg-amber")} style={{ width: size.lit, height: size.lit }} />
            </span>
          );
        }
        if (index === count) {
          return (
            <span key={x} aria-hidden="true" className="absolute -translate-1/2" style={at(x, y)}>
              <span className="absolute top-1/2 left-1/2 size-[34px] -translate-1/2 rounded-pill bg-off-white/35" />
              <span className="block drop-shadow-[0_0_4px_rgb(255_255_255/0.7)]">
                <span className={cn(STAR, "block bg-white")} style={{ width: size.next, height: size.next }} />
              </span>
            </span>
          );
        }
        return (
          <span key={x} aria-hidden="true" className="absolute -translate-1/2 drop-shadow-[0_0_2.5px_rgb(236_234_246/0.45)]" style={at(x, y)}>
            <span className={cn(STAR, "block bg-off-white/70")} style={{ width: size.empty, height: size.empty }} />
          </span>
        );
      })}
      <p aria-live="polite" className="absolute top-2.5 left-3.5 text-caption leading-normal font-semibold text-off-white">
        {count === stars.length ? "All stars lit" : `${count} of ${stars.length} lit`}
      </p>
    </div>
  );
}
