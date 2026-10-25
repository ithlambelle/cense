import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Every --text-* size in globals.css; tokens.test.ts fails if the two differ.
export const TYPE_SCALE = ["h1", "h2", "h3", "h4", "h5", "h6", "body-s", "body-m", "body-l", "caption", "button", "button-s", "number-s", "number-m", "number-l", "number-xl"];

// tailwind-merge only knows Tailwind's built-in sizes, so it read our custom
// type-scale classes (text-body-l, text-h3 ...) as text colors and dropped
// them whenever a color class followed. They are registered as font sizes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_SCALE }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
