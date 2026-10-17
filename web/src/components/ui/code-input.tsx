"use client"

import { TextField } from "@/components/ui/text-field"

export const CODE_LENGTH = 6

// Keeps digits only, so a pasted "482 916" or "482-916" still works.
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH)
}

type CodeInputProps = {
  value: string
  onChange: (code: string) => void
  label?: string
  error?: string
  disabled?: boolean
}

// One input, not six boxes, as drawn. The browser can fill it from the email
// or text message because of autocomplete="one-time-code".
function CodeInput({ value, onChange, label = "Verification code", error, disabled }: CodeInputProps) {
  return (
    <TextField
      label={label}
      error={error}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(digitsOnly(event.target.value))}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={CODE_LENGTH + 3}
      placeholder={`${CODE_LENGTH}-digit code`}
      inputClassName="tracking-[0.35em] placeholder:tracking-normal"
    />
  )
}

export { CodeInput }
