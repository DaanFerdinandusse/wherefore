import { cn } from "@/lib/ui/cn";

// The "your place" mark: a filled bookmark in an ink circle. It sits on map
// pins (24, with a surface ring), chat tiles (20), note rows (26), the rail
// (28), My places cards (34) and the Your pick block (36).
const glyphSize: Record<BookmarkMarkSize, number> = { 20: 9, 24: 10, 26: 11, 28: 12, 34: 14, 36: 14 };
export type BookmarkMarkSize = 20 | 24 | 26 | 28 | 34 | 36;

/** The bare bookmark glyph from the designs, in currentColor. */
export function BookmarkGlyph({ size = 12, filled = true, className }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M3 1.5h8v11L7 9.8 3 12.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookmarkMark({
  size = 24,
  ring = false,
  tone = "ink",
  label,
  className,
}: {
  size?: BookmarkMarkSize;
  /** A 2px surface ring, used where the mark overlaps a photo pin. */
  ring?: boolean;
  /** `surface` flips it for dark photos (surface circle, ink glyph). */
  tone?: "ink" | "surface";
  /** Accessible text; omit when a nearby label already says "Your place". */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill",
        tone === "ink" ? "bg-ink text-surface" : "bg-surface text-ink",
        ring && "border-2 border-surface",
        className,
      )}
    >
      <BookmarkGlyph size={glyphSize[size]} />
    </span>
  );
}
