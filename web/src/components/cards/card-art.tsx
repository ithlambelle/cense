import Image from "next/image";

import { cn } from "@/lib/utils";

// The issuer's own card art (lib/cards/rewards.ts `image`), fitted whole into
// a landscape card's 1.586 box: never cropped, so U.S. Bank's portrait cards
// stand upright in the middle. A hairline shadow follows the art's own edge,
// so a white card (Apple Card) still reads on a white page. James asked to see
// the card (Oct 26). With no clean art, a plain violet 15% card with the card
// symbol stands in, the fact chips' fill. Decorative: the card's name is
// always beside or above it.
export function CardArt({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("relative aspect-[1.586] shrink-0 rounded-[6px]", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes="(max-width: 430px) 40vw, 160px" className="object-contain drop-shadow-[0_0_1px_rgb(15_11_46/0.45)]" />
      ) : (
        <div data-testid="card-art-fallback" className="flex size-full items-center justify-center rounded-[6px] bg-violet/15">
          <Image src="/icons/card-symbol.svg" alt="" width={24} height={18} />
        </div>
      )}
    </div>
  );
}
