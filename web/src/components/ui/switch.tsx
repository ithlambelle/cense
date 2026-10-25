"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// The on/off toggle from the payment reminders frame (Figma 144:1838, "Toggle
// on"): a 48 by 28 violet pill with a 22px white knob inset 3px. The frame
// draws only the on state. Off moves the knob left on an indigo-black 45%
// track, which keeps 3 to 1 against white so the control stays visible (WCAG
// 1.4.11). The hit area reaches 44px tall around the 28px pill.
function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-pill p-[3px] outline-none transition-colors duration-200 after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[checked]:bg-violet data-[unchecked]:bg-indigo-black/45 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-[22px] rounded-full bg-white transition-transform duration-200 motion-reduce:transition-none data-[checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
