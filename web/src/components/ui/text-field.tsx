import { useId, type ComponentProps } from "react"

import { cn } from "@/lib/utils"

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "aria-invalid" | "aria-describedby"> & {
  label: string
  hint?: string
  // When set, the field is shown and announced as invalid.
  error?: string
}

// As drawn, a resting input has no visible border and its placeholder is the
// same color as typed text, so the label above carries the meaning.
function TextField({ label, hint, error, className, ...props }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "h-12 w-full rounded-input border-2 border-input bg-input pr-2 pl-3.5 text-body text-secondary-foreground caret-primary outline-none placeholder:text-secondary-foreground focus:border-primary aria-invalid:border-destructive disabled:opacity-60",
          className
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-label text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-label text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { TextField }
