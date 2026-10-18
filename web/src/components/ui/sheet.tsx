"use client"

import { Dialog } from "@base-ui/react/dialog"
import Xmark from "@gravity-ui/icons/Xmark"
import type { ReactNode } from "react"

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

// A bottom sheet for a step that needs the student's attention before they
// leave Cense (the hand-off sheets). Base UI's Dialog traps focus, closes on
// Escape or a tap outside, and returns focus to the control that opened it.
function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-indigo-black/40 transition-opacity motion-reduce:transition-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-phone flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-white px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none transition-transform motion-reduce:transition-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-heading text-h3 font-medium text-navy">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-pill text-indigo-black outline-none hover:bg-off-white focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Xmark aria-hidden="true" width={22} height={22} />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="text-body-m text-indigo-black">{description}</Dialog.Description>
          ) : null}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Sheet }
