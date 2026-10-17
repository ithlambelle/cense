import { useId, type ComponentProps, type ReactNode } from "react"

import { cn } from "@/lib/utils"

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "aria-invalid" | "aria-describedby"> & {
  label: string
  hint?: string
  // When set, the field is shown and announced as invalid.
  error?: string
  // A control inside the field at the end, such as the show-password eye.
  trailing?: ReactNode
  // Classes for the input itself; className styles the field around it.
  inputClassName?: string
}

// From the auth frames (405:509 and the focused and error states): off-white
// fill, 20px corners, violet edge when focused, coral edge when invalid. The
// error text itself is indigo-black with a coral marker (coral text on white
// fails WCAG AA contrast).
function TextField({ label, hint, error, trailing, className, inputClassName, ...props }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-s text-indigo-black">
        {label}
      </label>
      <div
        className={cn(
          "flex h-12 items-center rounded-input border-[1.5px] border-off-white bg-off-white pr-2 pl-3.5 focus-within:border-violet has-aria-invalid:border-coral has-disabled:opacity-60",
          className
        )}
      >
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-body-m text-indigo-black caret-violet outline-none placeholder:text-indigo-black/60",
            inputClassName
          )}
          {...props}
        />
        {trailing}
      </div>
      {hint ? (
        <p id={hintId} className="text-body-s text-indigo-black/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-2 text-body-s text-indigo-black">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-coral" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

export { TextField }
