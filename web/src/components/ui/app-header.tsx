import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

// The header on inner screens (denial, profile and resource frames): the
// designers' 33px back arrow flush with the content edge, a small centred
// title, and an optional action on the right.
function AppHeader({ backHref, backLabel = "Back", title, action }: { backHref: string; backLabel?: string; title: string; action?: ReactNode }) {
  return (
    <header className="box-content grid h-14 grid-cols-[88px_1fr_88px] items-center px-6 pt-8">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="flex h-12 w-[88px] items-center rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Image src="/icons/back-arrow.svg" alt="" width={33} height={33} />
      </Link>
      <p className="text-center text-body-s text-indigo-black">{title}</p>
      <div className="flex justify-end">{action}</div>
    </header>
  )
}

export { AppHeader }
