import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

// The outlined tag pill: taste tags ("Seafood", "Natural light"), ground
// rules, feature chips. Static text.
export function Pill({
  size = "sm",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  /** sm: 13px tags (taste tags), md: 14px (city counts). */
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-pill-outline font-medium text-ink",
        size === "sm" ? "h-[30px] px-3 text-ui-sm leading-4" : "h-9 px-4 text-ui",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
