import { Button as ButtonPrimitive } from "@base-ui/react/button"
import ChevronRight from "@gravity-ui/icons/ChevronRight"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Values from design's Design Edits page (Figma gPofkJWVZ2wUWyF9SfHW6O, 144:1326).
// Hover, pressed, keyboard focus and pending are not drawn in Figma. They are
// added in the system's style; the designers agreed to that on 2026-10-11.
const baseButtonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center gap-2 font-sans whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed aria-busy:cursor-progress motion-safe:active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // "Primary action" (144:2030, 144:2180, 144:2579): label left, chevron right.
        default:
          "h-14 rounded-button bg-violet text-button font-semibold text-white hover:bg-violet-hover active:bg-violet-pressed disabled:bg-violet-disabled disabled:text-navy aria-busy:bg-violet aria-busy:text-white",
        // Button/Secondary (79:9), as in "Back to your plan" (144:2581): Amethyst text, no fill or border.
        secondary:
          "h-11 justify-center rounded-button px-6 text-button-s font-semibold text-violet hover:text-violet-hover active:text-violet-pressed disabled:opacity-40 aria-busy:opacity-100",
        // "Compare side by side" (144:2785): white, Amethyst border, navy label.
        outline:
          "h-14 justify-center rounded-button border-[1.5px] border-violet bg-white px-6 text-button-s font-semibold text-navy hover:bg-off-white active:bg-off-white disabled:opacity-40 aria-busy:opacity-100",
        // "I already have an account" on the welcome frame (397:1505): navy outline and label.
        // Rectangular like every button: design made the 16px button canonical on 2026-10-24.
        navyOutline:
          "h-14 justify-center rounded-button border-[1.5px] border-navy bg-white px-6 text-button-s font-semibold text-navy hover:bg-off-white active:bg-off-white disabled:opacity-40 aria-busy:opacity-100",
        // "Log out" (144:3588) and the auth frames' supporting actions (397:1886).
        link: "h-auto min-h-11 justify-center rounded-none px-0 text-body-s text-violet underline underline-offset-2 hover:text-violet-hover",
      },
      size: {
        default: "w-full",
      },
      // Only the primary button draws a chevron. Where a frame's primary has
      // none (welcome 397:1505, auth 397:1908), the label is centered.
      chevron: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "default", chevron: true, className: "justify-between pr-4.5 pl-5" },
      { variant: "default", chevron: false, className: "justify-center px-5" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      chevron: true,
    },
  }
)

// Merged with cn() so a caller's className wins over the variant's classes,
// for links styled as buttons as well as for Button. Only the outline variants
// have a border, so the label and chevron sit at the frame's exact insets.
function buttonVariants(...args: Parameters<typeof baseButtonVariants>): string {
  return cn(baseButtonVariants(...args))
}

// The primary button's chevron: Gravity chevron-right at 14px (245:2346).
// Links styled with buttonVariants() put it after their label.
function ButtonChevron() {
  return <ChevronRight aria-hidden="true" width={14} height={14} />
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
  chevron = true,
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const showChevron = variant === "default" && chevron
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      focusableWhenDisabled={pending}
      className={cn(buttonVariants({ variant, size, chevron, className }))}
      {...props}
    >
      {/* The spinner sits with the label so the chevron stays at the far right. */}
      <span className="inline-flex items-center gap-2">
        {pending ? <Spinner /> : null}
        {children}
      </span>
      {showChevron ? <ButtonChevron /> : null}
    </ButtonPrimitive>
  )
}

export { Button, ButtonChevron, buttonVariants }
