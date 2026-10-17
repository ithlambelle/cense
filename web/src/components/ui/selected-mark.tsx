import CircleCheckFill from "@gravity-ui/icons/CircleCheckFill";

// The mark on a chosen answer. The designers' "Selection indicator" layer
// (Figma 397:1132) is empty, so this fills it: a shape cue, not colour alone
// (WCAG 1.4.1), in violet at 5.45:1 on white (1.4.11 needs 3:1).
export function SelectedMark() {
  return <CircleCheckFill aria-hidden="true" width={24} height={24} className="shrink-0 text-violet" />;
}
