import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// A round button with one icon and a required accessible label: the + on
// photo cards (surface), the profile close (soft), the new trip close
// (outline), the send arrow (ink), attach and voice (ghost), and the close on
// a map preview photo (glass).
export type IconButtonVariant = "surface" | "soft" | "outline" | "ink" | "ghost" | "glass";

const variantClasses: Record<IconButtonVariant, string> = {
  surface: "bg-surface text-ink hover:bg-surface-raised",
  soft: "bg-avatar text-ink hover:bg-rule-strong",
  outline: "border border-pill-outline text-ink hover:border-ink hover:bg-ink/5",
  ink: "bg-ink text-surface hover:bg-text-4",
  ghost: "text-text-3 hover:bg-ink/5 hover:text-ink",
  glass: "bg-surface/85 text-ink hover:bg-surface",
};

export function IconButton({
  label,
  icon,
  variant = "surface",
  size = 38,
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** What the button does, read by screen readers ("Add Contramar to the itinerary"). */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  /** Diameter in px: 32, 38, 40 or 44 in the designs. */
  size?: 32 | 38 | 40 | 44;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
