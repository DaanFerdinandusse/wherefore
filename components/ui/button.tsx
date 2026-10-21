import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { Spinner } from "./spinner";

// The pill button. `primary` is the ink pill ("+ New trip", "Add to
// itinerary"), `outline` the hairline pill ("Profile", "Add favorites"),
// `outline-strong` the 1.5px ink outline ("+ Save a place"), `ghost` a text
// action ("Not for Ana"). `soft` (avatar fill) is the slot picker, `light`
// sits on photos ("+ Add to Day 2"), `chip` is a suggested reply in the dock.
// Loading keeps the label in place (invisible) so the button never resizes.
export type ButtonVariant = "primary" | "outline" | "outline-strong" | "ghost" | "soft" | "light" | "chip";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-surface hover:bg-text-4",
  outline: "border border-nav-pill text-ink hover:border-ink hover:bg-ink/5",
  "outline-strong": "border-[1.5px] border-ink text-ink hover:bg-ink/5",
  ghost: "font-medium text-text-3 hover:bg-ink/5 hover:text-ink",
  soft: "bg-avatar text-ink hover:bg-rule-strong",
  light: "bg-surface text-ink hover:bg-surface-raised",
  chip: "font-medium bg-white/80 text-ink hover:bg-white",
};

// Heights from the designs: sm 31 (dock chips), md 40 (app bar), lg 48 (sheet actions).
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-[31px] gap-1.5 px-3.5 text-ui-sm",
  md: "h-10 gap-2 px-5 text-ui",
  lg: "h-12 gap-2 px-[22px] text-action",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  loading = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
} = {}) {
  return cn(
    "relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-pill font-semibold transition-colors",
    loading ? "cursor-progress" : "disabled:cursor-not-allowed disabled:opacity-45",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className,
  children,
  type = "button",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon, usually a lucide icon at 16px. */
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, loading, className })}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {icon}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} />
        </span>
      ) : null}
    </button>
  );
}
