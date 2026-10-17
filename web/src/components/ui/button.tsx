import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Hover, pressed, keyboard focus and pending are not drawn in Figma. They are
// added in the system's style; the designers agreed to that on 2026-10-11.
const baseButtonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-pill border border-transparent font-sans text-body-l whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed aria-busy:cursor-progress motion-safe:active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-violet text-white hover:bg-violet-hover active:bg-violet-pressed disabled:bg-violet-disabled disabled:text-navy aria-busy:bg-violet aria-busy:text-white",
        secondary:
          "border-[1.5px] border-violet bg-white text-indigo-black hover:bg-off-white active:bg-off-white disabled:opacity-40 aria-busy:opacity-100",
        // "I already have an account" on the welcome frame (397:1505): navy outline and label.
        navyOutline:
          "border-[1.5px] border-navy bg-white text-navy hover:bg-off-white active:bg-off-white disabled:opacity-40 aria-busy:opacity-100",
        outline:
          "border-track bg-transparent text-navy hover:bg-off-white",
        link: "h-auto min-h-11 rounded-none px-0 text-body-s text-indigo-black underline underline-offset-2 hover:text-navy",
      },
      size: {
        default: "h-14 w-full px-6",
        sm: "h-11 px-5 text-body-m font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Merged so a variant's border color wins over the base transparent border,
// for links styled as buttons as well as for Button.
function buttonVariants(...args: Parameters<typeof baseButtonVariants>): string {
  return cn(baseButtonVariants(...args))
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
    />
  )
}

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof baseButtonVariants> & {
    // Shows a spinner and blocks a second press while a request is in flight.
    pending?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      focusableWhenDisabled={pending}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
