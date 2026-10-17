"use client"

import Eye from "@gravity-ui/icons/Eye"
import EyeSlash from "@gravity-ui/icons/EyeSlash"
import { useState, type ComponentProps } from "react"

import { TextField } from "@/components/ui/text-field"

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "trailing">

// A password input with the show-password eye from the auth frames (44px target).
function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          disabled={props.disabled}
          className="flex size-11 shrink-0 items-center justify-center rounded-pill text-indigo-black outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          {visible ? <EyeSlash aria-hidden="true" width={24} height={24} /> : <Eye aria-hidden="true" width={24} height={24} />}
        </button>
      }
    />
  )
}

export { PasswordField }
