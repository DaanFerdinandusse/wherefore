"use client";

import Link from "next/link";

import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// The workspace could not load (the database or the session was unreachable).
export default function TripError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-8">
      <EmptyState
        title="This trip did not load"
        body="Something went wrong while opening the trip. Try again, or go back to your trips."
        action={
          <div className="flex gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link href="/trips" className={buttonClasses({ variant: "outline" })}>
              Back to trips
            </Link>
          </div>
        }
      />
    </div>
  );
}
