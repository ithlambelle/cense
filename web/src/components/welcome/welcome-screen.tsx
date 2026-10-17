import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

type Star = { kind: "star" | "sparkle"; x: number; y: number; size: number; rotate?: number };

// Positions from Figma 397:1505 (a 390 by 844 frame), as percentages so the
// field keeps its shape on any phone. Amber stars and off-white sparkles are
// one shape each, drawn at the sizes in the frame.
const STARS: Star[] = [
  { kind: "sparkle", x: 15, y: 388, size: 13 },
  { kind: "sparkle", x: 318, y: 481, size: 13 },
  { kind: "sparkle", x: 93, y: 249, size: 22 },
  { kind: "sparkle", x: 289, y: 64, size: 21 },
  { kind: "sparkle", x: 5, y: 31, size: 13 },
  { kind: "sparkle", x: 323, y: 205, size: 13 },
  { kind: "sparkle", x: 7, y: 764, size: 13 },
  { kind: "sparkle", x: 289, y: 575, size: 21 },
  { kind: "sparkle", x: 79, y: 617, size: 13 },
  { kind: "sparkle", x: 280, y: 665, size: 13 },
  { kind: "sparkle", x: 366, y: 310, size: 13 },
  { kind: "sparkle", x: 186, y: 160, size: 13 },
  { kind: "sparkle", x: 51, y: 144, size: 13 },
  { kind: "sparkle", x: 144, y: 60, size: 13 },
  { kind: "sparkle", x: 151, y: 566, size: 13 },
  { kind: "star", x: 289, y: 323, size: 28, rotate: 17.75 },
  { kind: "star", x: 64, y: 426, size: 23, rotate: 17.75 },
  { kind: "star", x: 316, y: 630, size: 23, rotate: 17.75 },
  { kind: "star", x: 59, y: 68, size: 36, rotate: 17.75 },
  { kind: "star", x: 254, y: 146, size: 17, rotate: 17.75 },
  { kind: "star", x: 45, y: 639, size: 28, rotate: 17.75 },
  { kind: "star", x: 343, y: 512, size: 23, rotate: 17.75 },
  { kind: "star", x: 184, y: 518, size: 18, rotate: 17.75 },
  { kind: "star", x: 291, y: 16, size: 23, rotate: 17.75 },
];

// The first screen a new visitor sees (Figma 397:1505).
export function WelcomeScreen() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main className="relative flex w-full max-w-phone flex-col overflow-hidden px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {STARS.map((star) => (
            <Image
              key={`${star.x}-${star.y}`}
              src={star.kind === "star" ? "/decor/star-large.svg" : "/decor/sparkle.svg"}
              alt=""
              width={star.size}
              height={star.size}
              className="absolute"
              style={{
                height: "auto",
                left: `${(star.x / 390) * 100}%`,
                top: `${(star.y / 844) * 100}%`,
                transform: star.rotate ? `rotate(${star.rotate}deg)` : undefined,
              }}
            />
          ))}
        </div>

        {/* The frame places the mascot 247px down an 844px screen (29.3%). */}
        <div className="relative flex flex-1 flex-col items-center gap-5 pt-[29.3dvh]">
          <Image src="/mascot/penny.png" alt="" width={157} height={157} priority className="rotate-[0.84deg]" />
          <h1 className="px-[61px] text-center font-heading text-h3 font-medium text-navy">
            Let’s make
            <br />
            Cense of money.
          </h1>
        </div>

        <div className="relative flex flex-col gap-2.5 pt-6">
          <Link href={ROUTES.signUp} className={buttonVariants()}>
            Get started
          </Link>
          <Link href={ROUTES.signIn} className={buttonVariants({ variant: "navyOutline" })}>
            I already have an account
          </Link>
          {/* Not in the frame: Ben's MVP1 flow starts with browsing cards. Proposed to design. */}
          <Link
            href={ROUTES.cards}
            className="min-h-6 content-center self-center text-body-s text-violet underline underline-offset-2 outline-none hover:text-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Browse cards
          </Link>
        </div>
      </main>
    </div>
  );
}
