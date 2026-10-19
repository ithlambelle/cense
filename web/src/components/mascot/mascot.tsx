type MascotPose = "happy" | "idle" | "sad" | "swim";

type MascotProps = {
  pose: MascotPose;
  size: number;
  className?: string;
  priority?: boolean;
};

// The artist's animated WebP exports are served directly. A still from the
// same drawing replaces each animation when the visitor prefers reduced motion.
export function Mascot({ pose, size, className, priority = false }: MascotProps) {
  const asset = `/mascot/astro-pig/${pose}`;

  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={`${asset}-still.png`} />
      {/* The WebP is already animated and should not pass through image optimization. */}
      <img
        src={`${asset}.webp`}
        alt=""
        width={size}
        height={size}
        className={className}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}
