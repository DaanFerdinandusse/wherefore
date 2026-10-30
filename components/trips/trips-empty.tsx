import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// No trips yet: one sentence on what happens next and the New trip action.
export function TripsEmpty() {
  return (
    <EmptyState
      title="Your trips will show up here"
      body="Pick a client and a city to start planning."
      action={
        <Link href="/trips?new=1" scroll={false} className={buttonClasses({ className: "mt-1" })}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          New trip
        </Link>
      }
      className="min-h-[360px]"
    />
  );
}
