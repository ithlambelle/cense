import ArrowLeft from "@gravity-ui/icons/ArrowLeft"
import Link from "next/link"
import type { ReactNode } from "react"

// The header on inner screens (denial and resource frames): back arrow, a
// small centred title, and an optional action on the right.
function AppHeader({ backHref, backLabel = "Back", title, action }: { backHref: string; backLabel?: string; title: string; action?: ReactNode }) {
  return (
    <header className="grid h-14 grid-cols-[48px_1fr_48px] items-center px-6 pt-8 box-content">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="flex size-12 items-center justify-center rounded-pill text-indigo-black outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" width={28} height={28} />
      </Link>
      <p className="text-center text-body-s text-indigo-black">{title}</p>
      <div className="flex justify-end">{action}</div>
    </header>
  )
}

export { AppHeader }
