import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

// "+ New trip" in a panel header: opens the New trip panel over the trips page.
export function NewTripLink({ href = "/trips?new=1" }: { href?: string }) {
  return (
    <Link href={href} scroll={false} className={buttonClasses({ className: "h-[38px] px-[18px]" })}>
      <Plus size={14} strokeWidth={2.4} aria-hidden />
      New trip
    </Link>
  );
}
