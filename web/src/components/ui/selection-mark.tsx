import Image from "next/image"

// The indicator on the right of an answer card, drawn from the designers'
// "Selection indicator" layer (Figma 85:17397, hi-fi quiz). Chosen: a Light
// Green circle with a Deep Navy check, the check well over 3:1 on the green, so
// the state is a shape cue, not colour alone (WCAG 1.4.1, 1.4.11). Not chosen:
// nothing, because tapping a pick-one answer moves on or picks the one. On a
// screen where taps only pick and a button moves on (the spending question,
// 144:2635), `ring` draws the designers' empty Lavender ring instead (G7). The
// card stays white either way; only this mark changes.
function SelectionMark({ selected, ring = false }: { selected: boolean; ring?: boolean }) {
  if (!selected) {
    if (!ring) return null
    // The frame's own asset (144:2657): white fill, 1.5 Lavender (#ECEAF6) ring.
    return <Image src="/icons/selection-ring.svg" alt="" width={24} height={24} className="shrink-0" />
  }
  return (
    <svg aria-hidden="true" width={24} height={24} viewBox="0 0 24 24" className="shrink-0 animate-pop">
      <circle cx="12" cy="12" r="12" className="fill-green" />
      <path
        className="fill-navy"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.6664 6.73224C18.7617 6.81523 18.8399 6.9165 18.8967 7.03024C18.9535 7.14399 18.9876 7.26799 18.9972 7.39515C19.0068 7.52232 18.9916 7.65016 18.9526 7.77136C18.9135 7.89256 18.8513 8.00475 18.7695 8.10152L11.1271 17.161C11.0414 17.2626 10.936 17.3451 10.8174 17.4033C10.6989 17.4615 10.5698 17.4942 10.4382 17.4993C10.3066 17.5044 10.1755 17.4818 10.0529 17.433C9.93032 17.3841 9.81902 17.31 9.72596 17.2154L5.26786 12.6856C5.09392 12.5025 4.99775 12.2572 5.00004 12.0027C5.00233 11.7482 5.10292 11.5048 5.28012 11.3249C5.45733 11.1451 5.69698 11.0431 5.94746 11.041C6.19794 11.0389 6.43921 11.1369 6.6193 11.3138L10.3488 15.1019L17.32 6.83836C17.4849 6.64318 17.7194 6.5225 17.9718 6.50284C18.2243 6.48318 18.4741 6.56486 18.6664 6.73224Z"
      />
    </svg>
  )
}

export { SelectionMark }
