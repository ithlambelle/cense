import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// The glow differs by the card's purpose (confirmed by the designers on
// 2026-10-11), so each purpose has its own token. Use one per screen.
const GLOW = {
  form: "shadow-glow-form",
  result: "shadow-glow-result",
} as const

type GlowCardProps = ComponentProps<"div"> & { purpose: keyof typeof GLOW }

function GlowCard({ purpose, className, ...props }: GlowCardProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 rounded-card bg-card p-5", GLOW[purpose], className)}
      {...props}
    />
  )
}

export { GlowCard }
