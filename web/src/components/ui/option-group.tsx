"use client"

import { Check } from "lucide-react"
import { useId } from "react"

import { cn } from "@/lib/utils"

export type Option<Value extends string> = { value: Value; label: string }

type OptionGroupProps<Value extends string> = {
  // Read by screen readers as the name of the group, usually the question.
  labelledBy: string
  options: Option<Value>[]
  value: Value | null
  onChange: (value: Value) => void
  // Rows are 80 tall with two choices and 56 with more, as drawn.
  density?: "roomy" | "compact"
  disabled?: boolean
}

// Native radio inputs, hidden but focusable, so the browser supplies the
// expected keyboard behaviour: one tab stop, arrow keys move, space selects.
function OptionGroup<Value extends string>({
  labelledBy,
  options,
  value,
  onChange,
  density = "roomy",
  disabled = false,
}: OptionGroupProps<Value>) {
  const name = useId()

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("flex flex-col", density === "roomy" ? "gap-6" : "gap-5")}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-center gap-4 has-disabled:cursor-progress rounded-card border-[1.5px] border-primary bg-background px-5 py-3 text-body text-foreground transition-colors hover:bg-off-white",
            // Figma draws the selected label navy on this fill, which cannot be read; white is the
            // system's text color on optionSelected (flagged to design 2026-10-16).
            "has-checked:border-selected-outline has-checked:bg-option-selected has-checked:text-white has-checked:shadow-glow-option",
            "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
            density === "roomy" ? "min-h-20" : "min-h-14"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            disabled={disabled}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span className="flex-1">{option.label}</span>
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-off-white bg-background text-transparent peer-checked:bg-primary peer-checked:text-white"
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        </label>
      ))}
    </div>
  )
}

export { OptionGroup }
