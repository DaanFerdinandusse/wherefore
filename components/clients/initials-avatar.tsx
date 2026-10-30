import { cn } from "@/lib/ui/cn";
import { initials } from "@/lib/ui/initials";

// The client's Bodoni initials in a round warm fill: 48 on a Clients card,
// 64 in the profile header. Clients have no photo in v3.
const SIZES = {
  48: "size-12 text-[22px] leading-6",
  64: "size-16 text-[28px] leading-7",
} as const;

export function InitialsAvatar({
  name,
  size,
  tone = "canvas",
  className,
}: {
  name: string;
  size: keyof typeof SIZES;
  /** canvas on the cards (on the raised surface), avatar in the profile header. */
  tone?: "canvas" | "avatar";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-display tracking-normal text-ink",
        tone === "canvas" ? "bg-canvas" : "bg-avatar",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
