import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Hover, pressed, keyboard focus and pending are not drawn in Figma. They are
// added in the system's style; the designers agreed to that on 2026-10-11.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-pill border border-transparent font-sans text-button whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed aria-busy:cursor-progress motion-safe:active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-violet-hover active:bg-violet-pressed disabled:bg-violet-disabled aria-busy:bg-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-off-white active:bg-off-white disabled:opacity-40 aria-busy:opacity-100",
        outline:
          "border-border bg-transparent text-foreground hover:bg-accent",
        link: "h-auto min-h-11 rounded-none px-0 text-label text-muted-foreground underline underline-offset-2 hover:text-foreground",
      },
      size: {
        default: "h-14 w-full px-6",
        sm: "h-11 px-5 text-body font-bold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
    />
  )
}

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
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
