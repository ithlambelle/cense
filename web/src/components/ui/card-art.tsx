import { cn } from "@/lib/utils"

// Card art, Plain on a light surface (Figma 301:2513): a mini navy card with
// an amber chip and a faint stripe, 56 by 38. The card lists' leading art
// (Profile "Your card", Cards).
function CardArt({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative block h-[38px] w-14 shrink-0 rounded-[6px] bg-navy", className)}>
      <span className="absolute top-[9px] left-[7px] h-2 w-[11px] rounded-[2px] bg-amber" />
      <span className="absolute top-[27px] left-[7px] h-[3px] w-[26px] rounded-[2px] bg-white/35" />
    </span>
  )
}

export { CardArt }
