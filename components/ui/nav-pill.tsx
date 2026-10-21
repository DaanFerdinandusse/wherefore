import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/ui/cn";

// App navigation link in uppercase labels (Trips, Clients, My places). The
// current page wears the hairline outline; the others are quiet text.
export function NavPill({
  active = false,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "label-caps inline-flex h-[35px] items-center whitespace-nowrap rounded-pill border px-4 leading-4 transition-colors",
        active ? "border-nav-pill text-ink" : "border-transparent text-text-3 hover:bg-ink/5 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
