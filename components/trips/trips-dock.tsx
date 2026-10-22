import Link from "next/link";
import { Sparkle } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { GlassDock } from "@/components/ui/glass-dock";

import { nudgeMessage, type Nudge } from "./nudges";

// The lighter assistant on the Trips page: plain nudges computed from the
// trips rows, each with a link to its trip. No model call and no composer.
export function TripsDock({ nudges }: { nudges: Nudge[] }) {
  const links = nudges.filter((n, i) => nudges.findIndex((m) => m.tripId === n.tripId) === i);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-7">
      <GlassDock label="What needs you" className="pointer-events-auto">
        <div className="flex items-start gap-3 px-1">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-ink text-surface">
            <Sparkle size={16} strokeWidth={2} fill="currentColor" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-[5px]">
            <p className="text-body leading-[22px] text-ink">{nudgeMessage(nudges)}</p>
            {links.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {links.map((nudge, i) => (
                  <Link
                    key={nudge.tripId}
                    href={`/trips/${nudge.tripId}`}
                    className={buttonClasses({ variant: i === 0 ? "primary" : "chip", size: "sm" })}
                  >
                    {nudge.action}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </GlassDock>
    </div>
  );
}
